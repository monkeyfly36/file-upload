'use strict'
const path = require('path')
const svgCaptcha = require('svg-captcha')
const fse = require('fs-extra')

const BaseController = require('./base')

class UtilController extends BaseController {
  async captcha() {
    const { ctx } = this
    const captcha = svgCaptcha.create({
      size: 4,
      fontSize: 50,
      width: 100,
      height: 40,
      noise: 3,
    })
    console.log('captcha：' + captcha.text)
    ctx.session.captcha = captcha.text
    ctx.response.type = 'image/svg+xml'
    ctx.body = captcha.data
  }
  async sendcode() {
    const { ctx } = this
    const email = ctx.query.email
    const code = Math.random().toString().slice(2, 6)
    ctx.session.emailcode = code
    console.log('邮箱：' + email + ' 验证码：' + code)

    const subject = '文件上传验证码'
    const text = ''
    const html = `<h2>小丢社区</h2><a href="https://kaikeba.com"><span>${code}</span></a>`
    const hasSend = await this.service.tools.sendMail(email, subject, text, html)
    if (hasSend) {
      this.message('发送成功')
    } else {
      this.error('发送失败')
    }
  }
  async uploadfile() {
    if(Math.random() < 0.5) {
      return this.ctx.status = 500
    }
    const { ctx } = this
    const file = ctx.request.files[0]
    const { hash, name } = ctx.request.body
    const chunkPath = path.resolve(this.config.UPLOAD_DIR, hash)
    // const filePath = path.resolve(this.config.UPLOAD_DIR, name) // 文件最终存储位置, 合并之后
    if(!fse.existsSync(chunkPath)) {
      await fse.mkdir(chunkPath)
    }
    await fse.move(file.filepath, `${chunkPath}/${name}`)
    this.message('切片上传成功')

    // await fse.move(file.filepath, `${this.config.UPLOAD_DIR}/${file.filename}`)
    // this.success({url: `public/${file.filename}`})
  }
  async mergefile() {
    const { ext, size, hash } = this.ctx.request.body
    const filePath = path.resolve(this.config.UPLOAD_DIR, `${hash}.${ext}`)
    await this.ctx.service.tools.mergeFile(filePath, hash, size)
    this.success({
      url: `/public/${hash}.${ext}`,
    })
  }
  async checkfile() {
    const { ext, hash } = this.ctx.request.body
    const filePath = path.resolve(this.config.UPLOAD_DIR, `${hash}.${ext}`)

    let uploaded = false
    let uploadedList = []
    if (fse.existsSync(filePath)) { // 文件存在
      uploaded = true
    } else {
      uploadedList = await this.getUploadedList(path.resolve(this.config.UPLOAD_DIR, hash))
    }
    this.success({ uploaded, uploadedList })
  }
  // 注意规避.DS_Strore
  async getUploadedList(dirPath) {
    return fse.existsSync(dirPath)
      ? (await fse.readdir(dirPath)).filter(name => name[0] !== '.')
      : []
  }
}

module.exports = UtilController
