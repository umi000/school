const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { healthRoutes } = require("./routes/health.routes");
const { studentRoutes } = require("./routes/students.routes");
const { promotionRoutes } = require("./routes/promotions.routes");
const { authRoutes } = require("./routes/auth.routes");
const { masterRoutes } = require("./routes/masters.routes");
const { certificateRoutes } = require("./routes/certificates.routes");
const { academicRoutes } = require("./routes/academics.routes");
const { leavingRoutes } = require("./routes/leaving.routes");
const { userRoutes } = require("./routes/users.routes");
const { reportRoutes } = require("./routes/reports.routes");

const app = express();

app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Serve uploaded student photos statically
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Serve frontend public assets (logo, favicon) so print reports can embed them
app.use(express.static(path.join(__dirname, "..", "..", "frontend", "public")));

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", studentRoutes);
app.use("/api", promotionRoutes);
app.use("/api", masterRoutes);
app.use("/api", certificateRoutes);
app.use("/api", academicRoutes);
app.use("/api", leavingRoutes);
app.use("/api", userRoutes);
app.use("/api", reportRoutes);

app.use((err, _req, res, _next) => {
  const status = err?.name === "ZodError" ? 400 : 500;
  const msg = err.message || "Internal server error";
  const payload = {
    message: msg,
    details: err.issues || undefined,
  };
  if (/localhost:1433|1433.*connect/i.test(msg)) {
    payload.hint =
      "Usually SQL Express: set DB_INSTANCE=SQLEXPRESS in backend/.env, start SQL Server Browser, or run the backend from the backend folder so .env loads (this project now loads backend/.env automatically).";
  }
  res.status(status).json(payload);
});

module.exports = { app };


