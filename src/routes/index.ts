import { Router } from "express";
export const router = Router();

import apiPitcherRouter from './pitcher';
import apiHitterRouter from './hitter';

router.use('/pitcher', apiPitcherRouter);
router.use('/hitter', apiHitterRouter);
