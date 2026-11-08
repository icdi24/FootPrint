const express = require('express');
const { makeMiddleware } = require('../middleware');
const {
  DeepSeekSettingsError, modelSettings, saveDeepSeekSettings, deleteDeepSeekSettings,
} = require('../agent/deepseek-settings');

module.exports = function deepSeekRoutes(db) {
  const router = express.Router();
  const { requireUser } = makeMiddleware(db);
  const path = '/zoowy/model';

  function handle(action) {
    return async (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      try {
        res.json(await action(db, req.user.id, req.body));
      } catch (error) {
        if (error instanceof DeepSeekSettingsError) return res.status(error.status).json({ error: error.message });
        next(error);
      }
    };
  }

  router.get(path, requireUser, handle(modelSettings));
  router.put(path, requireUser, handle(saveDeepSeekSettings));
  router.delete(path, requireUser, handle(deleteDeepSeekSettings));
  return router;
};
