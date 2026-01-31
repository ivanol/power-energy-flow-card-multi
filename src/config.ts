import { CardConfig, DeviceConfig, DeviceConnection } from "./interfaces";


export class ConfigManager {

    // Takes a hass configuration object, and returns a valid CardConfig, or an error.
    // This either converts the Hass config into a valid Typescript object so we know
    // everything we need is there (filling in default values as it goes), or raises
    // an error.
    processConfig(config: any): CardConfig {
        if (!config) config = {}
        let result: CardConfig = {
            title: config.title ? config.title : "PEFCM Card",
            power_or_energy: "power",
            devices: [],
            maxX: 0,
            maxY: 0,
            width: 400,
            height: 300,
            circle_radius: config.circle_radius ? config.circle_radius : 40
        }
        this.validateUnknownKeys(config, ["title", "devices", "circle_radius", "type"], "Unknown key in card config: ")

        if (!config.devices || config.devices.length == 0) throw new Error("No devices defined")

        for (const d of config.devices)
            result.devices.push(this.validateDevice(d))

        this.validateReferences(result)

        return result
    }

    // Take an object that is either an array of strings, or a single string, and return an array of strings.
    private makeStringArray(a: any, error_hint: string): string[] {
        if(!a) return []
        if(typeof(a)=="string") return [a]
        if (Object.prototype.toString.call(a) != "[object Array]") throw new Error("Expected an array of strings")
        for (const s of a) {
            if(typeof(s) != "string") throw new Error(error_hint + " should be an array of strings")
        }
        return a
    }

    private validateUnknownKeys(d: any, allowed: string[], error_hint: string) {
        for (const k in d) {
            if(allowed.indexOf(k)==-1) throw new Error(error_hint + k)
        }
    }

    // Final validations that check cross references.
    private validateReferences(config: CardConfig) {
        const s = new Set<string>()
        for (const d of config.devices)
            s.add(d.id)
        for (const d of config.devices) {
            for (const c of d.connections) {
                if (!s.has(c.target))
                    throw new Error(`Connection target "${c.target}" doesn't exist`)
            }
        }
    }

    private validateDevice(d: any): DeviceConfig {
        if (!d) throw new Error("Empty device definition")
        if (!d.id) throw new Error("Device must have an id")
        if (!("xPos" in d)) throw new Error("Device needs an xPos")
        if (!("yPos" in d)) throw new Error("Device needs a yPos")
        this.validateUnknownKeys(d, ["xPos", "yPos", "id", "name", "energy_sink", "energy_source", "power_source", "power_sink", "max_power", "connections", "icon"], "Unknown key in device: ")

        let result: DeviceConfig = {
            name: d.name ? d.name : d.id,
            id: d.id,
            icon: d.icon ? d.icon : "",
            power_sink: this.makeStringArray(d.power_sink, "Power sink"),
            power_source: this.makeStringArray(d.power_source, "Power source"),
            energy_sink: this.makeStringArray(d.energy_sink, "Energy sink"),
            energy_source: this.makeStringArray(d.energy_source, "Energy source"),
            xPos: d.xPos,
            yPos: d.yPos,
            type: "grid", // FIXME / TODO not used
            connections: [],
            max_power: d.max_power ? d.max_power : 20
        }

        if (result.power_sink.length + result.power_source.length + result.energy_sink.length + result.energy_source.length == 0) {
            throw new Error("Need to define at least one of power_sink power_source energy_sink or energy_source")
        }

        if (d.connections) {
            for (const c of d.connections)
                result.connections.push(this.validateConnection(c))
        }

        return result
    }

    private validateConnection(connection: any): DeviceConnection {
        this.validateUnknownKeys(connection, ["desc", "target", "color", "mode"], "Unknown key in connection: ")
        if (!connection) throw new Error("Empty connection definition")
        if (!connection.desc) throw new Error("Connection need to have a description of its route")
        if (!connection.target) throw new Error("Connection need to have a target")
        return {
            desc: `${connection.desc}`, // Some paths are valid numbers, but need interpreting as strings
            target: connection.target,
            color: connection.color ? connection.color : "black",
            mode: connection.mode
        }
    }
}