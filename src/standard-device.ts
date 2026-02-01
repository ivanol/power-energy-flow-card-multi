import { DeviceConfig, DisplayConfig, UpdateReceiver, UpdateSender, States, CardConfig, Drawer, DeviceConnection, HtmlString, FlowDevice } from "./interfaces";
import { SVGDrawer } from "./svg-drawer";
/*
 * A device represents both a conceptual device (eg. battery or inverter), and also the area
 * on the card where that device is displayed.  It is responsible for rendering itself and
 * for receiving updates about entities it is interested in.
 *
 * A device is not necessarily the same as a home assistant device. We may contain entities
 * from multiple HA devices. eg. a battery may display SoC taken from the battery device in
 * HA, and power from HA's interverter device.
 *
 * StandardDevice is usable by itself for some devices, but may be subclassed in the future.
 *
 * A +ve value in power_source/energy_source means power/energy is leaving the device to enter the
 * house. So a discharging battery, grid import, or solar panel production.
 * A +ve value in power_in/energy_in means power/energy is entering the device from the house,
 * such as a charging battery, grid feed-in, or load.
 *
 * Power is given as a single figure representing current power flow. Use power_in/power_out
 * if you have separate entities for in and out flows. We can also use this if a device contains
 * other devices (eg. a single CT clamp for garage supply, which includes EV charger and other
 * loads - our Garage device can have this CT clamp in power_in, and the EV charger in power_out,
 * meaning calculated power is Garage power consumption not including EV).
 */
export class StandardDevice implements UpdateReceiver, FlowDevice {
    _config: DeviceConfig;
    _card: CardConfig
    _updateSender: UpdateSender;
    _inUpdateCycle: boolean = false;
    _valueCache: { power?: number, energyin?: number, energyout?: number } = {}
    _elements: {
        circles?: HTMLElement[], // For connection circles
        circle?: HTMLElement, // For device circle
        animations?: HTMLElement[],
        lines?: HTMLElement[],
        circleHtml?: HTMLElement,
        needs_reload: boolean
    }
    _elementID: number
    remainingValue: number; // Used when calculating power/energy flows.
    _hass_states: States // A local reference to most recent hass state.
    static idCounter: number = 1;

    // Save config and the updateSender, and register for updates on our entities.
    constructor(config: DeviceConfig, card: CardConfig, updateSender: UpdateSender) {
        this._config = config;
        this._card = card;
        this._updateSender = updateSender;
        this._elementID = StandardDevice.idCounter
        StandardDevice.idCounter += 1
        this._elements = { needs_reload: true }

        for (const entity of [...config.power_sink, ...config.power_source, ...config.energy_sink, ...config.energy_source]) {
            updateSender.registerUpdateReceiver(entity, this);
        }
        if(config.percent_entity) this._updateSender.registerUpdateReceiver(config.percent_entity, this);
    }

    // Accessors
    get id(): string {
        return this._config.id
    }

    get connections(): DeviceConnection[] {
        return this._config.connections
    }

    // Called when configuration is changed. We may now be listening to different entities.
    updateConfig(config: DeviceConfig) {
        for (const entity of [...this._config.power_sink, ...this._config.power_source, ...this._config.energy_sink, ...this._config.energy_source]) {
            this._updateSender.unregisterUpdateReceiver(entity, this);
        }
        for (const entity of [...config.power_sink, ...config.power_source, ...config.energy_sink, ...config.energy_source]) {
            this._updateSender.registerUpdateReceiver(entity, this);
        }
        if(this._config.percent_entity) this._updateSender.unregisterUpdateReceiver(this._config.percent_entity, this);
        if(config.percent_entity) this._updateSender.registerUpdateReceiver(config.percent_entity, this);
        this._config = config;
    }

    // Find entityIds' values within states, check they're valid, convert W and Wh to kW and kWh if needed, and sum them.
    private sumEntities(states: States, entityIds: string[]): number {
        var result: number = 0;
        if (!states || !entityIds) return 0;
        for (const entityId of entityIds) {
            const stateObj = states[entityId];
            if (stateObj && stateObj.state !== "unavailable" && stateObj.state !== "unknown") {
                const unit = stateObj.attributes && stateObj.attributes.unit_of_measurement ? stateObj.attributes.unit_of_measurement : "";
                const factor = unit == "W" || unit == "Wh" ? 0.001 : 1; // convert W to kW, Wh to kWh
                result += parseFloat(stateObj.state)*factor;
            }
        }
        return result;
    }

    getPower(states: States): number {
        if ("power" in this._valueCache) return this._valueCache.power
        this._valueCache.power = this.defaultRound(
            this.sumEntities(states, this._config.power_source)
            - this.sumEntities(states, this._config.power_sink));
        if(Math.abs(this._valueCache.power) < this._config.floor) this._valueCache.power = 0
        return this._valueCache.power
    }

    getEnergyIn(states: States): number {
        if ("energyin" in this._valueCache) return this._valueCache.energyin
        this._valueCache.energyin = this.defaultRound(this.sumEntities(states, this._config.energy_sink));
        if(Math.abs(this._valueCache.energyin) < this._config.floor) this._valueCache.energyin = 0
        return this._valueCache.energyin
    }

    getEnergyOut(states: States): number {
        if ("energyout" in this._valueCache) return this._valueCache.energyout
        this._valueCache.energyout = this.defaultRound(this.sumEntities(states, this._config.energy_source));
        if(Math.abs(this._valueCache.energyout) < this._config.floor) this._valueCache.energyout = 0
        return this._valueCache.energyout
    }

    // Energy doesn't really work at the moment, but maybe this will be useful in the future.
    power_or_energy(states: States): number {
        if (this._card.power_or_energy == "power") {
            return this.getPower(states)
        } else {
            return this.getEnergyOut(states) - this.getEnergyIn(states)
        }
    }

    private defaultRound(value: number): number {
        return Math.round(value*100)/100;
    }

    // Work out whihc display config we should use. We
    private getDisplayConfig(card: CardConfig, states: States, type: "circle" | "icon" | "text"): DisplayConfig {
        let poe = this.power_or_energy(states)
        let activitySuffix = poe > 0 ? "-source" : poe < 0 ? "-sink" : "-inactive"

        // Look for most specific display config first.
        let keys: string[] = []
        keys.push(`display-${type}${activitySuffix}`)
        if (activitySuffix == "-source" || activitySuffix == "-sink") keys.push(`display-${type}-active`)
        else keys.push(`display-${type}-inactive`)
        keys.push(`display-${type}`)
        keys.push(`display${activitySuffix}`)
        if (activitySuffix == "-source" || activitySuffix == "-sink") keys.push(`display-active`)
        else keys.push(`display-inactive`)
        keys.push('display')

        if(this._config.id=="grid") console.log("Display config keys to check:", keys)
        for (const k of keys) {
            if (k in this._config.display) {
                return this._config.display[k]
            }
        }

        for (const k of keys)
            if (k in this._card.display)
                return this._card.display[k]

        return { color: "black", size: 1, circle_radius: -1, hidden: false }
    }

    // Returns the html for the foreignObject in the middle of each circle.
    private getHtml(config: CardConfig, states: States): HtmlString {
        let text: string = "";
        const textDisplay = this.getDisplayConfig(config, states, "text");
        const iconDisplay = this.getDisplayConfig(config, states, "icon");
        if (config.power_or_energy == "power") {
            const power = this.getPower(states)
            const icon = power >= 0 ? "mdi:arrow-bottom-left" : "mdi:arrow-top-right";
            text = `<span class="return text_element_${this._elementID}" style="${this.getStyle(textDisplay)}" id="return_${this._elementID}"><ha-icon class="small" icon="${icon}"></ha-icon>${Math.abs(power)} kW</span>`
        } else {
            const energyIn = this.getEnergyIn(states);
            const energyOut = this.getEnergyOut(states);
            text = `<span class="return" id="return_${this._elementID}"><ha-icon class="small" icon="mdi:arrow-left"></ha-icon>${energyIn} kWh</span>
                    <span class="consumption" id="consumption_${this._elementID}"><ha-icon class="small" icon="mdi:arrow-right"></ha-icon>${energyOut} kWh</span>`
        }

        let percent = ""
        let main_icon = this._config.icon
        if (this._config.percent_entity && states[this._config.percent_entity] && states[this._config.percent_entity].state !== "unavailable" && states[this._config.percent_entity].state !== "unknown") {
            let pct = Math.round(parseFloat(states[this._config.percent_entity].state)*10)/10
            percent = `<div id="percent_${this._elementID}" class="text_element_${this._elementID}" style="${this.getStyle(textDisplay)}">${pct}%</div><br>`
            if (main_icon == "") {
                let pctd = Math.floor(pct / 10) * 10
                if (pctd > 100) pctd = 100
                if(pctd<10) pctd = 10
                main_icon = `mdi:battery-${pctd}`
            }
        }
        return `${percent}<ha-icon icon="${main_icon}" style="${this.getStyle(iconDisplay)}" id="mainicon_${this._elementID}"></ha-icon><br>${text}<br><span style="${this.getStyle(textDisplay)}" class="text_element_${this._elementID}">${this._config.name}</span>` as HtmlString;
    }

    private calcAnimationParams(line: DeviceConnection): [ballsize: number, freq: number] {
        const powerState = Math.abs(line.value) / this._config.max_power
        if (powerState == 0) return [0, 1000]
        const ballsize = Math.min(Math.max(4, powerState * 10), 10)
        const direction = line.value > 0 ? 1 : -1
        let freq = Math.max(1 / powerState, 1);
        freq = Math.min(freq, 15);
        freq *= direction
        return [ballsize, freq]
    }

    getStyle(DisplayConfig: DisplayConfig): string {
        return `color: ${DisplayConfig.color}; ${DisplayConfig.hidden ? "display: none;" : ""}`;
    }

    getPathHtml(config: CardConfig, states: States, drawer: Drawer): HtmlString {
        this._elements.needs_reload = true
        const x1 = drawer.getCoordX(this._config.xPos);
        const y1 = drawer.getCoordY(this._config.yPos);
        const displayCircle = this.getDisplayConfig(config, states, "circle");
        const circleRadius = displayCircle.circle_radius > 0 ? displayCircle.circle_radius : this._card.circle_radius;
        const circleStyle = `${displayCircle.hidden ? 'style="display: none;"' : ""}`;

        const node = `<circle cx="${x1}" cy="${y1}" r="${circleRadius}" fill="white" ${circleStyle} stroke="${displayCircle.color}" id="circle_${this._elementID}"/>
        <foreignObject x="${x1 - circleRadius}" y="${y1 - circleRadius}" width="${circleRadius * 2}" height="${circleRadius * 2}">
            <div xmlns="http://www.w3.org/1999/xhtml" id="cconts_${this._elementID}" class="circle-contents" style="width: ${circleRadius * 2}px; height: ${circleRadius * 2}px;">
                ${this.getHtml(config, states)}
            </div>
        </foreignObject>`;
        let paths = ""
        let lcnt = 1
        for (const l of this._config.connections) {
            const id = `line_${this._elementID}_${lcnt}`
            lcnt += 1
            let [ballsize, freq] = this.calcAnimationParams(l)
            paths += drawer.getPathSvg(this._config.xPos, this._config.yPos, l.desc, l.color, id, ballsize, freq)
        }
        return node+paths as HtmlString;
    }

    // Receive updated values. As we can deal with this entirely from incrementalUpdate() without a full redraw
    // we simply invalidate our valueCache, and return false (to indicate we don't ned a redraw)
    hassUpdate(entity: string, states: States): boolean {
        this._valueCache = {}
        this._hass_states = states
        return false;
    }

    private searchElements(card: HTMLElement) {
        if (!this._elements.needs_reload) return
        this._elements.circleHtml = card.querySelector(`#cconts_${this._elementID}`)
        this._elements.circles = []
        this._elements.animations = []
        this._elements.lines = []
        let lcnt = 1
        this._elements.circle = card.querySelector(`#circle_${this._elementID}`)
        for (const l of this.connections) {
            const k = `#line_${this._elementID}_${lcnt}`
            lcnt += 1
            this._elements.circles.push(card.querySelector(k + "_circle"))
            this._elements.animations.push(card.querySelector(k + "_animate"))
            this._elements.lines.push(card.querySelector(k))
            //console.log("Finding circle and animate for ", this.id, "called", k+"_circle", k+"_animate")
        }
        this._elements.needs_reload = false
    }

    incrementalUpdate(card: HTMLElement) {
        this.searchElements(card)
        for (let i = 0; i < this.connections.length; i++) {
            const [ballsize, ballSpeed] = this.calcAnimationParams(this.connections[i])
            if (this._elements.circles[i]) this._elements.circles[i].setAttribute("r", `${ballsize}`)
            if (this._elements.animations[i]) {
                let keyPoints = ballSpeed > 0 ? "0;1" : "1;0"
                this._elements.animations[i].setAttribute("dur", `${Math.abs(ballSpeed)}`)
                this._elements.animations[i].setAttribute("keyPoints", keyPoints)
                if(this.connections[i].value==0){
                    this._elements.lines[i].classList.add("pefcm-hidden-line");
                } else {
                    this._elements.lines[i].classList.remove("pefcm-hidden-line");
                }
            }
        }
        this._elements.circleHtml.innerHTML = this.getHtml(this._card, this._hass_states)
        let displayCircle = this.getDisplayConfig(this._card, this._hass_states, "circle");
        const circleStyle = `${displayCircle.hidden ? 'display: none;' : ""}`;

        this._elements.circle.setAttribute("style", circleStyle)
        this._elements.circle.setAttribute("r", `${displayCircle.circle_radius > 0 ? displayCircle.circle_radius : this._card.circle_radius}`)
        this._elements.circle.setAttribute("stroke", displayCircle.color)
    }

    hassUpdateCycleComplete(): boolean {
        this._inUpdateCycle = false;
        return false;
    }

}