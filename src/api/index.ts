import { Router } from "express";
export const router = Router();

import apiPitcherRouter from './pitcher';
import apiHitterRouter from './hitter';
import apiGameRouter from './game';

router.use('/pitcher', apiPitcherRouter);
router.use('/hitter', apiHitterRouter);
router.use('/game', apiGameRouter);
