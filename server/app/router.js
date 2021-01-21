'use strict'

/**
 * @param {Egg.Application} app - egg application
 */
module.exports = app => {
  const { router, controller } = app
  const jwt = app.middleware.jwt({ app })
  router.get('/', controller.home.index)

  // 验证码
  router.get('/captcha', controller.util.captcha)
  router.get('/sendcode', controller.util.sendcode)
  router.post('/uploadfile', controller.util.uploadfile)
  router.post('/mergefile', controller.util.mergefile)
  router.post('/checkfile', controller.util.checkfile)

  router.group({ name: 'user', prefix: '/user' }, router => {
    const { info, register, login, verify, 
            isfollow, follow, cancelFollow, following, followers,
            likeArticle, cancelLikeArticle, articleStatus } = controller.user
    router.post('/register', register)
    router.post('/login', login)

    router.get('/info', jwt, info)
    router.get('/detail', jwt, info)
    router.get('/verify', verify)
    // 用户查看--查看关注和粉丝
    router.get('/:id/following', following)
    router.get('/:id/followers', followers)
    // 文章详情--关注和点赞
    router.get('/follow/:id', jwt, isfollow)
    router.put('/follow/:id', jwt, follow)
    router.delete('/follow/:id', jwt, cancelFollow)
    // .put点赞，delete取消点赞
    router.get('/article/:id', jwt, articleStatus)
    router.put('/likeArticle/:id', jwt, likeArticle)
    router.delete('/likeArticle/:id', jwt, cancelLikeArticle)
  })

  router.group({ name: 'article', prefix: '/article' }, router => {
    const { create, detail, index } = controller.article
    router.post('/create', jwt, create)
    router.get('/:id', detail)
    router.get('/', index)
  })
}
