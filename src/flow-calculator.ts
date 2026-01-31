import { DeviceConnection, States } from './interfaces.js';
import { FlowDevice } from './interfaces.js';

/*


Connection power assignment process therefore needs to be as follows.
Starting position: all devices have net_power_flow set to 0. All connections have flow set to undefined. Once a connection is defined
it should remain unchanged until we get new data. net_power_flow is decreased and increased by the same amount in devices at the opposite
ends of the connection (so the sum of all net_power_flows should remain at 0).
    1. Any connection with an assigned entity for power measurement gets that power assigned
    2. While any device exists with only one remaining undefined connection:
        - Assign that connection a value that brings net_power_flow to the intrinsic power of this device. For a purely transmission node
          this will be 0. For a device with it's own usage that will be the amount used/produced by the device.
    3. For all remaining connections in turn assign the largest amount that brings both ends towards the expected value without overshooting.
    4. All other connections are 0.

*/

class ConnectionFlow {
    c: DeviceConnection
    fromDevice: FlowDevice
    value: number | null = null
}

export class FlowCalculator {
    private _devices: FlowDevice[]
    private _connections: ConnectionFlow[] = []
    private _deviceIdMap: Map<string, FlowDevice> = new Map<string, FlowDevice>()
    private _deviceNetFlow: Map<string, number> = new Map<string, number>()
    private _debug: boolean = false

    constructor(devices: FlowDevice[], debug: boolean = false) {
        this._devices = devices
        this._debug = debug
    }

    private reset() {
        this._connections = []
        this._deviceIdMap = new Map<string, FlowDevice>()
        this._deviceNetFlow = new Map<string, number>()
        for (const device of this._devices) {
            this._deviceIdMap.set(device.id, device)
            this._deviceNetFlow.set(device.id, 0);  // device.power_or_energy({}))
            for (const c of device.connections) {
                this._connections.push({ c: c, fromDevice: device, value: null })
            }
        }
    }

    get unassignedConnections(): ConnectionFlow[] {
        return this._connections.filter((cf) => cf.value == null)
    }

    // A list of connections either to or from a device.
    private deviceConnections(device: FlowDevice): ConnectionFlow[] {
        return this._connections.filter((cf) => cf.fromDevice.id == device.id || cf.c.target == device.id)
    }

    private deviceUnassignedConnections(device: FlowDevice): ConnectionFlow[] {
        return this.deviceConnections(device).filter((cf) => cf.value == null)
    }

    // A list of devices that have only one unassigned connection.
    get singletonDevices(): FlowDevice[] {
        let result: FlowDevice[] = []
        for (const device of this._devices) {
            if (this.deviceUnassignedConnections(device).length == 1) {
                result.push(device)
            }
        }
        return result
    }

    private setConnectionValue(c: ConnectionFlow, value: number) {
        if (c.value !== null)
            throw new Error(`Connection from ${c.fromDevice.id} to ${c.c.target} already has value assigned`)
        c.value = value
        if (!c.c.internal) {
            const fromRem = this._deviceNetFlow.get(c.fromDevice.id)
            this._deviceNetFlow.set(c.fromDevice.id, fromRem + value)
        }
        const toDevice = this._deviceIdMap.get(c.c.target)
        const toRem = this._deviceNetFlow.get(toDevice.id)
        this._deviceNetFlow.set(toDevice.id, toRem - value)
    }

    private assignSingletonDevices(states): number {
        let cnt = 0
        for (const device of this.singletonDevices) {
            const conns = this.deviceUnassignedConnections(device)
            if (conns.length != 1) continue // conns.length could be 0 if our connection was assigned by the device at the other end.
            const c = conns[0]
            const dir = (c.fromDevice.id == device.id) ? 1 : -1
            const value = dir * (device.power_or_energy(states) - this._deviceNetFlow.get(device.id))
            if (this._debug) {
                console.log(device.id, "is a singleton. Connection from", c.fromDevice.id, "to", c.c.target, "Device value", device.power_or_energy(states), " existing flow", this._deviceNetFlow.get(device.id), " setting flow to", value)
                console.log("Device expected power/energy is", c.fromDevice.power_or_energy(states), this._deviceIdMap.get(c.c.target)?.power_or_energy(states))
                console.log("Pre  assignment net flows are", this._deviceNetFlow.get(c.fromDevice.id), this._deviceNetFlow.get(c.c.target))
            }
            this.setConnectionValue(c, value)
            if(this._debug) console.log("Post assignment net flows are", this._deviceNetFlow.get(c.fromDevice.id), this._deviceNetFlow.get(c.c.target))
            cnt += 1
        }
        return cnt
    }

    private assignDefinedConnections(states: States) {
        for (const cf of this.unassignedConnections) {
            const c = cf.c
            if (c.entity) {
                let value = 0
                const stateObj = states[c.entity];
                if (stateObj && stateObj.state !== "unavailable" && stateObj.state !== "unknown") {
                    value = parseFloat(stateObj.state);
                }
                this.setConnectionValue(cf, parseFloat(stateObj.state));
            }
        }
    }

    private heuristicCompleteAssignments(states: States) {
        // Up until now this has been a well defined problem. Now we prioritise (currently based on definition order).
        // This probably doesn't always work. But at least it's only visualisation!
        for(const cf of this.unassignedConnections) {
            const fromDevice = cf.fromDevice
            const toDevice = this._deviceIdMap.get(cf.c.target)
            const fromRem = fromDevice.power_or_energy(states) - this._deviceNetFlow.get(fromDevice.id)
            const toRem = toDevice.power_or_energy(states) - this._deviceNetFlow.get(toDevice.id)
            if (fromRem * toRem >= 0) {
                // Either both exporting or both importing, or one or both is at zero.
                if(this._debug) console.log("No flow between", fromDevice.id, "and", toDevice.id, "Remaining value on each is", fromRem, toRem)
                this.setConnectionValue(cf, 0)
            } else {
                const transferAmount = Math.min(Math.abs(fromRem), Math.abs(toRem))
                const dir = (fromRem > 0) ? 1 : -1
                if(this._debug) console.log("Setting flow between", fromDevice.id, "and", toDevice.id, "to", dir * transferAmount, " Remaining values", fromRem, toRem, "to", fromRem - dir * transferAmount, toRem + dir * transferAmount)
                this.setConnectionValue(cf, dir * transferAmount)
                if(this._debug) console.log("After assignment, net remaining values are", fromDevice.power_or_energy(states) - this._deviceNetFlow.get(fromDevice.id), toDevice.power_or_energy(states) - this._deviceNetFlow.get(toDevice.id));
            }
        }
    }

    private copyFlowValues() {
        for (const cf of this._connections) {
            cf.c.value = cf.value
        }
    }

    calculatePowerFlows(states: States) {
        this.reset()
        if(this._debug) console.log("Have", this._connections.length, "connections to assign")
        this.assignDefinedConnections(states)
        if(this._debug) console.log("After assigning defined connections, have", this.unassignedConnections.length, "unassigned connections")
        while (this.assignSingletonDevices(states) > 0);
        if(this._debug) console.log("After assigning singleton devices, have", this.unassignedConnections.length, "unassigned connections")

        this.heuristicCompleteAssignments(states)
        if (this._debug) {
            console.log("Final connection assignments:")
            for (const cf of this._connections) {
                console.log(`   from ${cf.fromDevice.id} to ${cf.c.target}: ${cf.value}`)
            }
            console.log("Final device net flows:")
            for (const device of this._devices) {
                console.log(`    ${device.id}: ${this._deviceNetFlow.get(device.id)} expected ${device.power_or_energy(states)}`)
            }
        }

        this.copyFlowValues()
    }
}