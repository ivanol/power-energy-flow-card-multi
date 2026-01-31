export type States = {
    [entityId: string]: {
        state: string;
        attributes: {
            [key: string]: any;
        };
        last_changed: string;
        last_updated: string;
    };
}

export type HassData = {
    states: States
}

declare const HtmlStringBrand: unique symbol;
export type HtmlString = string & { [HtmlStringBrand]: never };

export interface UpdateReceiver {
    // Send an update. Entity that triggered it is in string.
    // Full hass state object also passed.
    // Returns true if update means we need a complete re-render.
    // Returns false if can cope with an element by element update.
    hassUpdate(entity: string, states: States): boolean;

    // If receiver is listening to multiple objects it may receive
    // multiple calls to hassUpdate() in a single update cycle.
    // This signals that all updates for this cycle have been sent.
    // Returns true if a re-render is needed.
    // Returns false if no re-render needed.
    hassUpdateCycleComplete(): boolean;
}

export interface Drawer {
    getCoordX(xPos: number): number
    getCoordY(yPos: number): number
    getPathSvg(startDeviceX: number, startDeviceY: number, pathDesc: string, color: string, id: string, ballRadius: number, ballSpeed: number): HtmlString
}

export interface UpdateSender {
    // Register an update receiver.
    registerUpdateReceiver(entity: string, receiver: UpdateReceiver): void;

    // Unregister an update receiver.
    unregisterUpdateReceiver(entity: string, receiver: UpdateReceiver): void;
}

export interface DeviceConnection {
    target: string // ID of target
    desc: string   // Route description of connection line
    color: string
    mode?: "onedirection" | "reverse"
    entity?: string // An entity containing the value of flow on this connection.
    // No ability to reverse this, so if available entities have wrong
    // sign will either have to create a template helper, or record connection in oppposite
    // direction.
    value?: number // We store calculated flow down this connection here.
    internal?: boolean // If true, this connection explains where a device gets its power/energy from, but doesn't subtract from the devices value.
}

export interface DeviceConfig {
    name: string;
    id: string;
    icon: string;
    power_sink: string[]; // list of entity IDs that describe power flowing into the device
    power_source: string[]; // list of entity IDs for power being produced or leaving the device
    energy_sink: string[]; // As above, but for energy
    energy_source: string[]; // As above, but for energy
    xPos: number;
    yPos: number;
    type: string; // inverter, battery, load, solar, grid, generator, etc. TODO - type this properly once we have a plan.
    connections: DeviceConnection[]
    max_power: number // Maximum input/output power. Used to determine line sizes and power flow visualisations.
    percent_entity?: string // An entity that gives a percentage value for state of charge etc.
}

export interface CardConfig {
    title: string;
    power_or_energy: "power" | "energy";
    devices: DeviceConfig[];
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    circle_radius: number;
    debug?: boolean;
}
export interface FlowDevice {
    power_or_energy(states: States): number
    id: string
    connections: DeviceConnection[]
}