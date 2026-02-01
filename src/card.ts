import { ConfigManager } from "./config";
import { css } from "./css";
import { FlowCalculator } from "./flow-calculator";
import { CardConfig, HassData, UpdateReceiver, UpdateSender } from "./interfaces";
import { StandardDevice } from "./standard-device";
import { SVGDrawer } from "./svg-drawer";

export class PowerEnergyFlowMulti extends HTMLElement implements UpdateSender {
    // private properties
    _config: any;
    _hass: HassData;
    _elements: any = {};
    _updateReceivers: Map<string, Set<UpdateReceiver>> = new Map();
    _entityStateUpdates: Map<string, string> = new Map();
    _needsRerender: boolean = true;
    _devices: StandardDevice[] = [];
    _cardInnerHtml: string = "";
    _resizeObserver: ResizeObserver | null = null;

    _cardConfig: CardConfig = {
        title: "PEFCM Card",
        power_or_energy: "power",
        devices: [],
        maxX: 0,
        maxY: 0,
        width: 200,
        height: 300,
        circle_radius: 40,
        display: {}
    };

    // lifecycle
    constructor() {
        super();
        this.doCard();
        this.doStyle();
        this.doAttach();
        this.doQueryElements();
        this.doListen();
    }

    setConfig(config: any) {
        this._config = config;
        this.doCheckConfig();
        this.doUpdateConfig();
    }

    set hass(hass: any) {
        this._hass = hass;
        this.doUpdateHass();
    }

    connectedCallback() {
        this._resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                this._cardConfig.width = entry.contentRect.width;
                this.forceRerender();
            }
        });
        this._resizeObserver.observe(this);
    }

    onClicked() {
        this.doToggle();
    }

    isOff() {
        return this.getState().state === "off";
    }

    isOn() {
        return this.getState().state === "on";
    }

    getHeader() {
        return this._cardConfig.title
    }

    getEntityID() {
        return this._config.entity;
    }

    getState() {
        return this._hass.states[this.getEntityID()];
    }

    getAttributes() {
        return this.getState().attributes;
    }

    getName() {
        const friendlyName = this.getAttributes().friendly_name;
        return friendlyName ? friendlyName : this.getEntityID();
    }

    // UpdateSender interface. This lets us send incoming hass updates to the drawing objects that need them.
    registerUpdateReceiver(entity: string, receiver: UpdateReceiver): void {
        if (!this._updateReceivers.has(entity)) {
            this._updateReceivers.set(entity, new Set());
            this._entityStateUpdates.set(entity, "never");
        }
        this._updateReceivers.get(entity)?.add(receiver);
    }

    unregisterUpdateReceiver(entity: string, receiver: UpdateReceiver): void {
        if(this._updateReceivers.has(entity)) {
            this._updateReceivers.get(entity)?.delete(receiver);
        }
    }

    // jobs
    doCheckConfig() {
        const c = new ConfigManager()
        this._cardConfig = c.processConfig(this._config)
    }

    doCard() {
        //this._cardConfig.width = 466;
        this._cardConfig.height = (this._cardConfig.maxY + 1) * 100;

        let drawer = new SVGDrawer(this._cardConfig)

        //console.log("Force rerender to " + this._cardConfig.width + "x" + this._cardConfig.height, this.clientWidth, this.clientHeight);
        if(!this._elements.card) this._elements.card = document.createElement("ha-card");
        this._cardInnerHtml = `<div class="svg-wrapper"><svg class="svg-overlay" viewBox="0 0 ${this._cardConfig.width} ${this._cardConfig.height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">`;
        for (const device of this._devices) {
            this._cardInnerHtml += device.getPathHtml(this._cardConfig, this._hass?.states, drawer);
        }

        this._cardInnerHtml += `</svg></div>`;
        var html = '<div class="card-content pefcm-content">' + this._cardInnerHtml + '</div>'
        this._elements.card.innerHTML = html;
    }

    doStyle() {
        this._elements.style = document.createElement("style");
        this._elements.style.textContent = css
      }

    doAttach() {
        this.attachShadow({ mode: "open" });
        this.shadowRoot?.append(this._elements.style, this._elements.card);
    }

    doQueryElements() {
        const card = this._elements.card;
        this._elements.error = card.querySelector(".error");
        this._elements.card_content = card.querySelector(".pefcm-content");
    }

    doListen() {
        this._elements.card.addEventListener(
            "click",
            this.onClicked.bind(this),
            false
        );
    }

    doUpdateConfig() {
        this._devices = [];

        this._cardConfig.maxX = 0;
        this._cardConfig.maxY = 0;
        for (const deviceConfig of this._cardConfig.devices) {
            if (deviceConfig.xPos > this._cardConfig.maxX) this._cardConfig.maxX = deviceConfig.xPos;
            if (deviceConfig.yPos > this._cardConfig.maxY) this._cardConfig.maxY = deviceConfig.yPos;
            this._devices.push(new StandardDevice(deviceConfig, this._cardConfig, this))
        }

        if (this.getHeader()) {
            this._elements.card.setAttribute("header", this.getHeader());
        } else {
            this._elements.card.removeAttribute("header");
        }
    }

    calculatePowerFlows() {
        const fc = new FlowCalculator(this._devices, this._cardConfig.debug);
        fc.calculatePowerFlows(this._hass.states);
    }

    doUpdateHass() {
        let relevantUpdate: boolean = false
        for (const [entity, receivers] of this._updateReceivers) {
            const newState = this._hass.states[entity];
            const lastUpdated = this._entityStateUpdates.get(entity);
            if(newState && lastUpdated !== newState.last_updated) {
                this._entityStateUpdates.set(entity, newState.last_updated);
                for (const receiver of receivers) {
                    const needsRerender = receiver.hassUpdate(entity, this._hass.states);
                    if (needsRerender) this._needsRerender = true;
                }
                if(receivers.size>0) relevantUpdate = true
            }
        }
        if (!relevantUpdate) {
            //console.log("Hass update not relevant for us. Ignoring")
            return
        }

        this.calculatePowerFlows()

        if (this._needsRerender) {
            if(this._cardConfig.debug) console.log("Full rerender")
            this.forceRerender();
        } else {
            if(this._cardConfig.debug) console.log("Doing incremental redraw")
            for (const device of this._devices)
                device.incrementalUpdate(this._elements.card)
        }

        for (const device of this._devices)
            device.hassUpdateCycleComplete();
    }

    forceRerender() {
        this._needsRerender = false;
        this.doCard();
        this._elements.card_content.innerHTML = this._cardInnerHtml;
    }

    doToggle() {
        return // We don't have a working power setup yet, so limit it to energy.
        if (this._cardConfig.power_or_energy == "energy") {
            this._cardConfig.power_or_energy = "power";
        } else {
            this._cardConfig.power_or_energy = "energy";
        }
        this.forceRerender()
    }

    // Visual configuration - not written yet.
    //static getConfigElement() {
    //    return document.createElement("power-energy-flow-multi-editor");
    //}

    static getStubConfig() {
        return {
  "type": "custom:power-energy-flow-multi",
  "title": "Household Electricity",
  "devices": [
    {
      "id": "grid",
      "name": "Grid",
      "icon": "mdi:transmission-tower",
      "xPos": 0,
      "yPos": 1,
      "power_sink": "sensor.feed_in",
      "power_source": "sensor.grid_consumption",
      "connections": [
        {
          "desc": 62,
          "target": "home",
          "color": "red",
          "mode": "onedirection"
        }
      ],
      "max_power": 15
    },
    {
      "id": "battery",
      "name": "Battery",
      "xPos": 1,
      "yPos": 2,
      "power_source": "sensor.invbatpower",
      "max_power": 7,
      "icon": "mdi:battery-30",
      "connections": [
        {
          "target": "grid",
          "desc": "41 81",
          "color": "cyan"
        },
        {
          "target": "home",
          "color": "green",
          "desc": 91,
          "mode": "onedirection"
        }
      ]
    },
    {
      "id": "solar",
      "name": "solar",
      "xPos": 1,
      "yPos": 0,
      "power_source": "sensor.total_solar_power",
      "icon": "mdi:solar-power",
      "connections": [
        {
          "target": "battery",
          "desc": 22,
          "color": "orange",
          "mode": "onedirection"
        },
        {
          "target": "grid",
          "desc": "41 21",
          "color": "green",
          "mode": "onedirection"
        },
        {
          "target": "home",
          "desc": 31,
          "color": "green",
          "mode": "onedirection"
        }
      ]
    },
    {
      "id": "home",
      "xPos": 2,
      "yPos": 1,
      "power_sink": "sensor.load_power",
      "max_power": 10,
      "icon": "mdi:home"
    }
  ]
}
    }
}
