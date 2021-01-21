
const isGif = async function(file) {
  // GIF89a 和GIF87a -- 前面6个16进制，'47 49 46 38 39 61' '47 49 46 38 37 61'
  const ret = await blobToString(file.slice(0,6))
  const isGif = (ret=='47 49 46 38 39 61') || (ret=='47 49 46 38 37 61')
  return isGif
}
const isPng = async function(file) {
  const ret = await blobToString(file.slice(0,8))
  const ispng = (ret == "89 50 4E 47 0D 0A 1A 0A")
  return ispng
}
const isJpg = async function(file) {
  const len = file.size
  const start = await blobToString(file.slice(0,2))
  const tail = await blobToString(file.slice(-2,len))
  const isjpg = (start=='FF D8') && (tail=='FF D9')
  return isjpg
}
const isBmp = async function(file) {
  const len = file.size
  const start = await blobToString(file.slice(0,2))
  const isbmp = (start=='42 4D')
  return isbmp
}
const isImage = async function(file) {
  // 通过文件流来判定 gif/png/jp(e)g/bmp
  return await isGif(file) || await isPng(file) || await isJpg(file) || await isBmp(file)
}

async function blobToString(blob) {
  return new Promise(resolve=>{
    const reader = new FileReader()
    reader.onload = function(){
      // console.log(reader.result)
      const ret = reader.result.split('')
                    .map(v=>v.charCodeAt())
                    .map(v=>v.toString(16).toUpperCase())
                    .join(' ')
      // console.log(ret)              
      resolve(ret)
    }
    reader.readAsBinaryString(blob)
  })
}

export { isGif, isPng, isJpg, isBmp, isImage }