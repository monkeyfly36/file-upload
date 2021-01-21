<template>
  <div>
    <h1>用户中心</h1>
    <!-- 先加载loading, 防止渲染时不显示
    <i class="el-icon-loading"></i> -->

    <!-- 文件上传1.0 -->
    <div ref='drag' id="drag">
      <input type="file" name="file" @change="handleFileChange">
    </div>
    <!-- 文件上传2.0 -->
    <div>
      <el-progress :stroke-width='20' :text-inside="true" :percentage="uploadProgress"></el-progress>
    </div>
    <div>
      <el-button @click="uploadFile">上传</el-button>
    </div>
    <!-- 文件上传3.0 -->
    <div>
      <p>计算hash的进度</p>
      <el-progress :stroke-width='20' :text-inside="true" :percentage="hashProgress"></el-progress>
    </div>
    <!-- chunk.progress 
      progress < 0 报错 显示红色
              == 100 成功
      别的数字 方块高度显示 -->
    <!-- 尽可能让方块看起来是真方形
      比如10各方块 4*4
      9 3*3
      100 10*10 -->
    <div>
      <div class="cube-container" :style="{ width: cubeWidth + 'px' }">
        <div class="cube" v-for="chunk in chunks" :key="chunk.name">
          <div  :class="{ 'uploading': chunk.progress > 0 && chunk.progress < 100,
                         'success':chunk.progress == 100,
                         'error':chunk.progress < 0 }"
                :style="{ height:chunk.progress+'%'}"
          >
            <i class="el-icon-loading" style="color:#f56c6c" v-if="chunk.progress < 100 && chunk.progress > 0"></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { isImage } from '@/utils/img'
import { messTip } from '@/utils/mess'
import sparkMD5 from 'spark-md5'
const CHUNK_SIZE = 0.14 * 1024 * 1020 // 10M和100Kb区别 node切片start不能是小数？
export default {
  async mounted(){
    const ret = await this.$http.get('/user/info')
    this.bindEvents()
  },
  data(){
    return {
      file: null,
      hashProgress: 0,
      // uploadProgress: 0,
      chunks: []
    }
  },
  computed:{
    cubeWidth(){
      return Math.ceil(Math.sqrt(this.chunks.length)) * 16
    },
    uploadProgress(){
      if(!this.file || this.chunks.length){
        return 0
      }
      const loaded = this.chunks.map(item => item.chunk.size*item.progress)
                        .reduce((acc,cur) => acc+cur, 0)
      return parseInt(((loaded*100)/this.file.size).toFixed(2))
    }
  },
  methods:{
    // 文件上传1.0 -- 点击上传
    handleFileChange(e){
      const [file] = e.target.files
      if(!file) return 
      this.file = file
    },
    async uploadFile(){
      if(!this.file) return
      // this.chunks = this.createFileChunk(this.file)
      // 1.worker无法使用npm 2.更小的切片改用idle时间切片-> fiber架构启发 3.抽样hash(取巧, 布隆过滤器)
      // worker 
      // const hash2 = await this.calculateHashWorker()
      // console.log('文件计算 hash2:', hash2)
      // idle
      // const hash1 = await this.calculateHashIdle()
      // console.log('文件hash1', hash1)
      // 抽样hash
      const chunks = this.createFileChunk(this.file)
      const hash = await this.calculateHashSample()
      this.hash = hash
      // 问一下后端，文件是否上传过
      const { data: { uploaded, uploadedList } } = await this.$http.post('/checkfile',{
        hash: this.hash,
        ext: this.file.name.split('.').pop()
      })
      // 如果已经存在, 秒传
      if(uploaded) return this.$message.success('秒传成功')
      // 如果没有, 是否有存在的切片 - 断点续传
      this.chunks = chunks.map((chunk, index)=>{
        const name = hash + '-' + index // 切片的名字 hash+index
        return { hash, name, index, chunk: chunk.file, 
          progress: uploadedList.indexOf(name) > -1 ? 100 : 0 // 设置进度条，已经上传的，设为100
        }
      })
      await this.uploadChunks(uploadedList)
      
      // 通过二进制头信息判断图片
      // if(!await isImage(this.file)) {
      //   alert('不是图片')
      //   return
      // }
      // return

      // 单独上传文件 -- 未使用抽样hash, data设置uploadProgress
      // const form = new FormData()
      // form.append('name', 'file')
      // form.append('file', this.file)
      // const ret = await this.$http.post('/uploadfile', form, {
      //   onUploadProgress: progress => {
      //     this.uploadProgress = Number(((progress.loaded/progress.total)*100).toFixed(2))
      //   }
      // })
    },
    async uploadChunks(uploadedList=[]){
      const requests = this.chunks
        .filter(chunk => uploadedList.indexOf(chunk.name) == -1)
        .map((chunk, index) => {
          // ?? 转为promise
          const form = new FormData()
          form.append('chunk', chunk.chunk)
          form.append('hash', chunk.hash)
          form.append('name', chunk.name)
          return { form, index: chunk.index, error: 0 }
        })
        // .map(({form, index}) => this.$http.post('/uploadfile', form , {
        //   onUploadProgress: progress=>{
        //     // 不是整体的进度条了，而是每个区块有自己的进度条，整体的进度条需要计算
        //     this.chunks[index].progress = Number(((progress.loaded/progress.total)*100).toFixed(2))
        //   }
        // }))
        // @todo 并发量控制, Promise.all无法控制
        // 尝试申请tcp链接过多，也会造成卡顿
        // 异步的并发数控制
        await this.sendRequest(requests)
        // await Promise.all(requests) 
        await this.mergeRequest()
    },
    // @todo
    // TCP慢启动，先上传一个初始区块，比如10KB，根据上传成功时间，决定下一个区块是20K，还是50K，还是5K
    // 在下一个一样的逻辑，可能编程100K，200K，或者2K
    // async handleUpload1(){
    //     // @todo 数据缩放的⽐率 可以更平缓
    //     // @todo 并发+慢启动
    //     // 慢启动上传逻辑
    //     const file = this.container.file
    //     if (!file) return;
    //     this.status = Status.uploading;
    //     const fileSize = file.size
    //     let offset = 1024 * 1024
    //     let cur = 0
    //     let count = 0
    //     this.container.hash = await
    //     this.calculateHashSample();
    //     while (cur < fileSize) {
    //         // 切割offfset⼤⼩
    //         const chunk = file.slice(cur, cur + offset)
    //         cur += offset
    //         const chunkName = this.container.hash + "-" + count;
    //         const form = new FormData();
    //         form.append("chunk", chunk);
    //         form.append("hash", chunkName);
    //         form.append("filename", file.name);
    //         form.append("fileHash", this.container.hash);
    //         form.append("size", chunk.size);
    //         let start = new Date().getTime()
    //         await request({
    //             url: '/upload', data: form
    //         })
    //         const now = new Date().getTime()
    //         const time = ((now - start) / 1000).toFixed(4)
    //         let rate = time / 30
    //         // 速率有最⼤2和最⼩0.5
    //         if (rate < 0.5) rate = 0.5
    //         if (rate > 2) rate = 2
    //         // 新的切⽚⼤⼩等⽐变化
    //         console.log(`切⽚${count}⼤⼩是${this.format(offset)},耗时${time}秒，是30秒的${rate}倍，修正⼤⼩为${this.format(offset / rate)}`)
    //         // 动态调整offset
    //         offset = parseInt(offset / rate)
    //         // if(time)
    //         count++
    //     }
    // },

    // 上传可能报错
    // 报错之后，进度条变红，开始重试
    // 一个切片重试失败三次，整体全部终止
    async sendRequest(chunks, limit = 3){
      // limit是并发数, 一个数组, 长度是limit
      // [task1,task2,task3]
      return new Promise((resolve, reject)=>{
        const len = chunks.length
        let counter = 0 
        let isStop = false
        const start = async () => {
          if(isStop) return
          const task = chunks.shift()
          if(task) {
            const { form, index } = task
            try{
              await this.$http.post('/uploadfile',form,{
                onUploadProgress:progress=>{ // 不是整体的进度条了，而是每个区块有自己的进度条，整体的进度条需要计算
                  this.chunks[index].progress = Number(((progress.loaded/progress.total)*100).toFixed(2))
                }
              })
              if(counter == len-1){
                // 最后一个任务
                resolve()
              } else {
                counter ++
                // 启动下一个任务
                start()
              }
            } catch(e) {
              this.chunks[index].progress = -1
              if(task.error < 3) {
                task.error++
                chunks.unshift(task)
                start()
              } else {
                // 错误三次, 停止请求
                isStop = true
                reject()
                // 只显示一次提示
                messTip.error('文件上传失败, 请检查当前网络和文件格式!')
              }
            }
          }
        }

        while(limit > 0){
          // 启动limit个任务
          // 模拟一下延迟
          setTimeout(()=>{
            start()
          }, Math.random() * 2000)
          limit -= 1
        }
      })
    },
    async mergeRequest(){
      const ret = await this.$http.post('/mergefile',{
        ext: this.file.name.split('.').pop(),
        size: CHUNK_SIZE,
        hash: this.hash
      })
      // const url = ret.data.url
      // await this.$http.put('/user/info',{url:"/api"+url})
    },

    /* ***********************工具************************** */
    /* worker计算md5 */
    async calculateHashWorker(){
      return new Promise(resolve=>{
        this.worker = new Worker('/hash.js')
        this.worker.postMessage({chunks: this.chunks})
        this.worker.onmessage = e =>{
          const { progress, hash } = e.data
          this.hashProgress = Number(progress.toFixed(2))
          if(hash) {
            resolve(hash)
          }
        }
      })
    },
    /* idle计算md5
       60fps -- 1秒渲染60次 渲染1次 1帧，大概16.6ms -- 借鉴fiber架构
       |帧(system task，render，script)空闲时间  |帧 painting idle   |帧   |帧   | */
    async calculateHashIdle(){
      const chunks = this.chunks
      return new Promise(resolve=>{
        const spark = new sparkMD5.ArrayBuffer()
        let count = 0 

        const appendToSpark = async file=>{
          return new Promise(resolve=>{
            const reader = new FileReader()
            reader.readAsArrayBuffer(file)
            reader.onload = e =>{
              spark.append(e.target.result)
              resolve()
            }
          })
        }
        const workLoop = async deadline=>{
          // timeRemaining获取当前帧的剩余时间
          while(count < chunks.length && deadline.timeRemaining() > 1){
            // 空闲时间，且有任务
            await appendToSpark(chunks[count].file)
            count++
            if(count < chunks.length){
              this.hashProgress = Number(((100*count)/chunks.length).toFixed(2))
            } else {
              this.hashProgress = 100
              resolve(spark.end())
            }
          }
          window.requestIdleCallback(workLoop)
        }
        // 浏览器一旦空闲，就会调用workLoop
        window.requestIdleCallback(workLoop)
      })
    },
    /* 抽样hash计算md5 */
    async calculateHashSample(){
      // 布隆过滤器  判断一个数据存在与否
      // 1个G的文件，抽样后5M以内
      // hash一样，文件不一定一样; hash不一样，文件一定不一样
      return new Promise(resolve=>{
        const spark = new sparkMD5.ArrayBuffer()
        const reader = new FileReader()
        // 核心: 计算抽样hash
        const chunks = this.createSampleChunk(this.file)
        reader.readAsArrayBuffer(new Blob(chunks))
        reader.onload = e => {
          spark.append(e.target.result)
          this.hashProgress = 100
          resolve(spark.end())
        }
      })
    },

    /* 切割chunk */
    createFileChunk(file, size = CHUNK_SIZE){
      const chunks = [] 
      let cur = 0
      while(cur < this.file.size){
        chunks.push({ index: cur, file: this.file.slice(cur, cur+size) })
        cur += size
      }
      return chunks
    },
    /* 抽样切割chunk */
    createSampleChunk(file) {
      const size = file.size
      const offset = 2 * 1024 * 1024
      // 第一个取2M
      let chunks = [file.slice(0, offset)]
      let cur = offset
      while(cur < size) {
        if(cur + offset >= size) {
          // 最后一个区块数据全要
          chunks.push(file.slice(cur, cur + offset))
        } else {
          // 中间的，取前中后各2各字节
          const mid = cur + offset/2
          const end = cur + offset
          chunks.push(file.slice(cur, cur+2))
          chunks.push(file.slice(mid, mid+2))
          chunks.push(file.slice(end-2, end))
        }
        cur += offset
      }
      return chunks
    },

    /* 监听拖拽事件 */
    bindEvents(){
      const drag = this.$refs.drag
      drag.addEventListener('dragover',e=>{
        drag.style.borderColor = 'red'
        e.preventDefault()
      })
      drag.addEventListener('dragleave',e=>{
        drag.style.borderColor = '#eee'
        e.preventDefault()
      })
      drag.addEventListener('drop',e=>{
        const fileList = e.dataTransfer.files
        drag.style.borderColor = '#eee'
        this.file = fileList[0]
        e.preventDefault()
      })
    }, 
  


//     
//     
  }
}
</script>

<style lang="stylus">
#drag
  height 100px
  line-height 100px
  border 2px dashed #eee
  text-align center
.cube-container
  .cube
    width 14px
    height 14px
    line-height 12px
    border 1px black solid
    background #eee
    float left
    >.success
      background green
    >.uploading
      background #3a74ff
    >.error
      background red
</style>
