'use strict'

const md5 = require('md5')
const jwt = require('jsonwebtoken')
const BaseController = require('./base')

// md5 加盐
const HashSalt = 'Dg1304!@:monkeyfly36'
const createRule = {
  email: { type: 'email' },
  nickname: { type: 'string' },
  passwd: { type: 'string' },
  captcha: { type: 'string' },
}

class UserController extends BaseController {
  /* 登录 */
  async login() {
    const { ctx, app } = this
    const { email, captcha, passwd, emailcode } = ctx.request.body
    if (captcha.toUpperCase() !== ctx.session.captcha.toUpperCase()) {
      return this.error('验证码错误')
    }

    if (emailcode !== ctx.session.emailcode) {
      return this.error('邮箱验证码错误')
    }

    const user = await ctx.model.User.findOne({
      email,
      passwd: md5(passwd + HashSalt),
    })
    if (!user) {
      return this.error('用户名密码错误')
    }
    // 用户的信息加密成token 返回
    const token = jwt.sign({
      _id: user._id,
      email,
    }, app.config.jwt.secret, {
      expiresIn: '100h',
    })
    this.success({ token, email, nickname: user.nickname })
  }
  async register() {
    const { ctx } = this
    try {
      // 校验传递的参数
      ctx.validate(createRule)
    } catch (e) {
      return this.error('参数校验失败', -1, e.errors)
    }

    const { email, passwd, captcha, nickname } = ctx.request.body
    // 验证码
    if (captcha.toUpperCase() === ctx.session.captcha.toUpperCase()) {
      // 邮箱
      if (await this.checkEmail(email)) {
        return this.error('邮箱重复')
      }
      const ret = await ctx.model.User.create({
        email,
        nickname,
        passwd: md5(passwd + HashSalt),
      })
      if (ret._id) {
        this.message('注册成功')
      }

    } else {
      return this.error('验证码错误')
    }

    this.success({ name: 'kkb' })
  }
  async checkEmail(email) {
    // 验证邮箱是否重复
    const user = await this.ctx.model.User.findOne({ email })
    return user
  }
  async verify() {
    // 校验用户名是否存在
  }
  async info() {
    const { ctx } = this
    const { email } = ctx.state
    const user = await this.checkEmail(email)
    this.success(user)
  }
  /* 用户中心-关注和粉丝相关 */
  async following() {
    const { ctx } = this
    const users = await ctx.model.User.findById(ctx.params.id).populate('following')
    this.success(users.following)
  }
  async followers() {
    const { ctx } = this
    const users = await ctx.model.User.find({ following: ctx.params.id })
    this.success(users)
  }
  /* Article关注相关 */
  async isfollow() {
    const { ctx } = this
    const me = await ctx.model.User.findById(ctx.state.userid)
    // 我的follow字段里，有没有传来的这个用户id
    const isFollow = !!me.following.find(id => id.toString() === ctx.params.id)
    this.success({ isFollow })
  }
  async follow() {
    const { ctx } = this
    const me = await ctx.model.User.findById(ctx.state.userid)
    const isFollow = !!me.following.find(id => id.toString() === ctx.params.id)
    if (!isFollow) {
      me.following.push(ctx.params.id)
      me.save()
      this.message('关注成功')
    }
  }
  async cancelFollow() {
    const { ctx } = this
    const me = await ctx.model.User.findById(ctx.state.userid)
    // 把用户从我的following数组中删掉
    const index = me.following.map(id => id.toString()).indexOf(ctx.params.id)
    if (index > -1) {
      me.following.splice(index, 1)
      me.save()
      this.message('取消成功')
    }
  }
  /* Article点赞相关 */
  async likeArticle() {
    const { ctx } = this
    const me = await ctx.model.User.findById(ctx.state.userid)
    if (!me.likeArticle.find(id => id.toString() === ctx.params.id)) {
      me.likeArticle.push(ctx.params.id)
      me.save()
      await ctx.model.Article.findByIdAndUpdate(ctx.params.id, { $inc: { like: 1 } })
      return this.message('点赞成功')
    }
  }
  async cancelLikeArticle() {
    const { ctx } = this
    const me = await ctx.model.User.findById(ctx.state.userid)
    const index = me.likeArticle.map(id => id.toString()).indexOf(ctx.params.id)
    if (index > -1) {
      me.likeArticle.splice(index, 1)
      me.save()
      await ctx.model.Article.findByIdAndUpdate(ctx.params.id, { $inc: { like: -1 } })
      return this.message('取消点赞成功')
    }
  }
  async articleStatus() {
    const { ctx } = this
    const me = await ctx.model.User.findById(ctx.state.userid)
    console.log(me)
    const like = !!me.likeArticle.find(id => id.toString() === ctx.params.id)
    const dislike = !!me.disLikeArticle.find(id => id.toString() === ctx.params.id)
    this.success({
      like, dislike,
    })
  }
}

module.exports = UserController
