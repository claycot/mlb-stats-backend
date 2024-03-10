import { Router } from "express";
export const router = Router();

import apiPitcherRouter from './pitcher';

router.use('/pitcher', apiPitcherRouter);
