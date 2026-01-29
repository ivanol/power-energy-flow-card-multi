import { PowerEnergyFlowMulti } from "./card";
//import { PowerEnergyFlowMultiEditor } from "./editor"

declare global {
  interface Window {
    customCards: Array<Object>;
  }
}

customElements.define(
    "power-energy-flow-multi",
    PowerEnergyFlowMulti
);
//customElements.define(
//    "power-energy-flow-multi-editor",
//    PowerEnergyFlowMultiEditor
//);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "power-energy-flow-multi",
    name: "Multiple sources power or energy flow card",
    description: "View energy or power flow for multiple inverters, batteries and sources",
});
