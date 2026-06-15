import express from "express";

const app = express();

app.get("/", (_, res) => {
  res.json({
    application: "Security AI Lab",
    status: "running",
    version: "0.0.1"
  });
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Security AI Lab started on port ${PORT}`);
});