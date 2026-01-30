import { DeviceConfig, UpdateReceiver, UpdateSender, States, CardConfig, Drawer, DeviceConnection } from "./interfaces";
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
export class StandardDevice implements UpdateReceiver {
    _config: DeviceConfig;
    _card: CardConfig
    _updateSender: UpdateSender;
    _inUpdateCycle: boolean = false;
    _valueCache: { power?: number, energyin?: number, energyout?: number } = {}
    _elements: {
        circles?: HTMLElement[],
        animations?: HTMLElement[],
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
    }

    get id(): string {
        return this._config.id
    }

    get lines(): DeviceConnection[] {
        return this._config.lines
    }

    updateConfig(config: DeviceConfig) {
        for (const entity of [...this._config.power_sink, ...this._config.power_source, ...this._config.energy_sink, ...this._config.energy_source]) {
            this._updateSender.unregisterUpdateReceiver(entity, this);
        }
        for (const entity of [...config.power_sink, ...config.power_source, ...config.energy_sink, ...config.energy_source]) {
            this._updateSender.registerUpdateReceiver(entity, this);
        }
        this._config = config;
    }

    private sumEntities(states: States, entityIds: string[]): number {
        var result: number = 0;
        if (!states || !entityIds) return 0;
        for (const entityId of entityIds) {
            const stateObj = states[entityId];
            if (stateObj && stateObj.state !== "unavailable" && stateObj.state !== "unknown") {
                result += parseFloat(stateObj.state);
            }
        }
        return result;
    }

    getPower(states: States): number {
        if ("power" in this._valueCache) return this._valueCache.power
        this._valueCache.power = this.defaultRound(
            this.sumEntities(states, this._config.power_source)
            - this.sumEntities(states, this._config.power_sink));
        return this._valueCache.power
    }

    getEnergyIn(states: States): number {
        if ("energyin" in this._valueCache) return this._valueCache.energyin
        this._valueCache.energyin = this.defaultRound(this.sumEntities(states, this._config.energy_sink));
        return this._valueCache.energyin
    }

    getEnergyOut(states: States): number {
        if ("energyout" in this._valueCache) return this._valueCache.energyout
        this._valueCache.energyout = this.defaultRound(this.sumEntities(states, this._config.energy_source));
        return this._valueCache.energyout
    }

    private defaultRound(value: number): number {
        return Math.round(value*100)/100;
    }

    // Returns the html for the foreignObject in the middle of each circle.
    private getHtml(config: CardConfig, states: States): string {
        var text: string = "";
        if (config.power_or_energy == "power") {
            const power = this.getPower(states)
            const icon = power >= 0 ? "mdi:arrow-right" : "mdi:arrow-left";
            text = `<span class="return" id="return_${this._elementID}"><ha-icon class="small" icon="${icon}"></ha-icon>${Math.abs(power)} kW</span>`
        } else {
            const energyIn = this.getEnergyIn(states);
            const energyOut = this.getEnergyOut(states);
            text = `<span class="return" id="return_${this._elementID}"><ha-icon class="small" icon="mdi:arrow-left"></ha-icon>${energyIn} kWh</span>
                    <span class="consumption" id="consumption_${this._elementID}"><ha-icon class="small" icon="mdi:arrow-right"></ha-icon>${energyOut} kWh</span>`
        }

        return `<ha-icon icon="${this._config.icon}"></ha-icon><br>${text}<br>${this._config.name}`
    }

    private calcAnimationParams(line: DeviceConnection): [ballsize: number, freq: number] {
        const powerState = Math.abs(line._value) / this._config.max_power
        if (powerState == 0) return [0, 1000]
        const ballsize = Math.max(4, powerState * 10)
        const direction = line._value > 0 ? 1 : -1
        let freq = Math.max(1 / powerState, 1);
        freq = Math.min(freq, 15);
        freq *= direction
        return [ballsize, freq]
    }

    getPathHtml(config: CardConfig, states: States, drawer: Drawer): string {
        this._elements.needs_reload = true
        const x1 = drawer.getCoordX(this._config.xPos);
        const y1 = drawer.getCoordY(this._config.yPos);
        const circleRadius = this._card.circle_radius;
        const node = `<circle cx="${x1}" cy="${y1}" r="${circleRadius}" fill="white" stroke="black" />
        <foreignObject x="${x1 - circleRadius}" y="${y1 - circleRadius}" width="${circleRadius * 2}" height="${circleRadius * 2}">
            <div xmlns="http://www.w3.org/1999/xhtml" id="cconts_${this._elementID}" class="circle-contents" style="width: ${circleRadius * 2}px; height: ${circleRadius * 2}px;">
                ${this.getHtml(config, states)}
            </div>
        </foreignObject>`;
        let paths = ""
        let lcnt = 1
        for (const l of this._config.lines) {
            const id = `line_${this._elementID}_${lcnt}`
            lcnt += 1
            let [ballsize, freq] = this.calcAnimationParams(l)
            paths += drawer.getPathSvg(this._config.xPos, this._config.yPos, l.desc, l.color, id, ballsize, freq)
        }
        return node+paths
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
        let lcnt = 1
        for (const l of this.lines) {
            const k = `#line_${this._elementID}_${lcnt}`
            lcnt += 1
            this._elements.circles.push(card.querySelector(k + "_circle"))
            this._elements.animations.push(card.querySelector(k + "_animate"))
            //console.log("Finding circle and animate for ", this.id, "called", k+"_circle", k+"_animate")
        }
        this._elements.needs_reload = false
    }

    incrementalUpdate(card: HTMLElement) {
        this.searchElements(card)
        for (let i = 0; i < this.lines.length; i++) {
            const [ballsize, ballSpeed] = this.calcAnimationParams(this.lines[i])
            if (this._elements.circles[i]) this._elements.circles[i].setAttribute("r", `${ballsize}`)
            if (this._elements.animations[i]) {
                let keyPoints = ballSpeed > 0 ? "0;1" : "1;0"
                this._elements.animations[i].setAttribute("dur", `${Math.abs(ballSpeed)}`)
                this._elements.animations[i].setAttribute("keyPoints", keyPoints)
            }
        }
        this._elements.circleHtml.innerHTML = this.getHtml(this._card, this._hass_states)
    }

    hassUpdateCycleComplete(): boolean {
        this._inUpdateCycle = false;
        return false;
    }

}