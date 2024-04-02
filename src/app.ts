import express, { NextFunction, Request, Response } from "express";
import dotenv from "dotenv"; 
import morgan from "morgan"
dotenv.config();
const app = express();
const port = process.env.PORT;

app.use(morgan('dev'));

app.get("/ping", (req, res, next) => {
  res.json("Pong!");
});

import { router as apiRouter } from "./routes";
app.use("/api", apiRouter);

app.use((req, res, next) => {
  console.error(`Page not found. "${req.path}" does not exist`);

  res.status(404).json({
    error: "Page not found",
    message: `"${req.path}" does not exist`
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: err.name,
    message: err.message,
    stack: err.stack
  });
});

app.listen(port, () => {
  return console.log(`Express is listening at http://localhost:${port}`);
});
