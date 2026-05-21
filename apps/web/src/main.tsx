import { render } from "preact";
import { App } from "./App.js";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("root not found");
render(<App />, root);
