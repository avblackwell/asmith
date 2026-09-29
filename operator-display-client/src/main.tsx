import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { App } from "./app/App";
import { store } from "./state/store";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) throw new Error("Application root element was not found");

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  root,
);
