import { migrate } from "./db.js";

migrate().close();
console.log("SQLite schema ready.");
