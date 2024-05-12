import { Router } from "express";
export const router = Router();

import apiPitchersRouter from './pitchers';
import apiHittersRouter from './hitters';
import apiGamesRouter from './games';

router.use('/pitchers', apiPitchersRouter);
router.use('/hitters', apiHittersRouter);
router.use('/games', apiGamesRouter);
