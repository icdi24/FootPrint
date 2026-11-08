const express = require('express');
const { makeMiddleware } = require('../middleware');
const { MediaError, saveChatImage } = require('../agent/zoowy-media');

module.exports = function zoowyAttachmentsRoutes(db) {
  const router = express.Router();
  const { requireUser } = makeMiddleware(db);

  router.post('/zoowy/attachments', requireUser, async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const attachmentId = await saveChatImage(db, req.user.id, req.body?.dataUrl);
      res.status(201).json({ attachmentId });
    } catch (error) {
      if (!(error instanceof MediaError)) return next(error);
      res.status(error.status).json({ error: error.message });
    }
  });

  return router;
};
