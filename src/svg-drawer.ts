/*
 *  We draw lines between devices to show power flow, using svg paths.
 *  We will eventually automatically determine the paths of the lines,
 *  but will still need to be able to tweak them manually through config.
 *
 *  We will therefore use a text representation of the path, which will be
 *  parsed into svg path commands. Our path router will generate this
 *  text representation automatically whenever it is not specified in config.
 *
 *  A path description consists of a series of white-space separated commands.
 *  The first character is a digit that represents a direction to move in
 *  defined by the numpad:
 *
 *      7 8 9
 *      4 . 6
 *      1 2 3
 *
 *  The next set of digits (up until an optional ':') says how many device blocks
 *  to move. For diagonal movement we move this amount on each of x and y axis.
 *  So '30.5' moves down and right from the centre starting point of a device to
 *  the bottom right corner of it's grid square.
 *
 *  After the ':' is (yet to be implemented or defined) offset data which will
 *  help to avoid line collisions. For now we avoid.
 */
import { CardConfig, Drawer } from "./interfaces";

export class SVGDrawer implements Drawer {
    _xsize: number
    _ysize: number
    _width: number
    _height: number
    _circle_radius: number

    constructor(config: CardConfig) {
        this._xsize = config.maxX + 1;
        this._ysize = config.maxY + 1;
        this._width = config.width;
        this._height = config.height;
        this._circle_radius = config.circle_radius
    }

    // Conversions from grid coords to pixel coods.
    getCoordX(xPos: number): number {
        return Math.round((xPos + 0.5) / this._xsize * this._width * 10)/10;
    }

    getCoordY(yPos: number): number {
        return Math.round((yPos + 0.5) / this._ysize * this._height * 10)/10;
    }

    // Interpret a cmd, and apply it to a starting set of grid coords to get a new set of grid coords.
    // We also return a numerical offset, but so far this does nothing.
    private getNextDeviceCoords(startx: number, starty: number, cmd: string): [number, number, number, string] {
        let dx = 0, dy = 0
        if (cmd.length < 2) return [0, 0, 0, `Malformed command '${cmd}'`]

        const dir = cmd[0]
        const [dist, offset] = cmd.substring(1).split(':')
        if (dir == '9' || dir == '6' || dir == '3') dx = +1
        if (dir == '7' || dir == '4' || dir == '1') dx = -1
        if (dir == '7' || dir == '8' || dir == '9') dy = -1
        if (dir == '1' || dir == '2' || dir == '3') dy = 1

        const x = startx + dx * parseFloat(dist)
        const y = starty + dy * parseFloat(dist)


        return [x, y, parseFloat(offset), ""]
    }

    // Find a new point a distance from the end of the line. If we want it from the start need to reverse order of first
    // two coords.
    private midPointCoord(p1: [number, number], p2: [number, number], distanceFromEnd: number): [number, number] {
        const [x1, y1] = p1
        const [x2, y2] = p2
        if (x1 == x2)
            return [x1, y2 > y1 ? y2 - distanceFromEnd : y2 + distanceFromEnd]
        if (y1 == y2)
            return [x2 > x1 ? x2 - distanceFromEnd : x2 + distanceFromEnd, y1]
        const dx = x2 - x1
        const dy = y2 - y1
        const len = Math.sqrt(dx * dx + dy * dy)
        const r = distanceFromEnd / len
        return [x2 - dx*r, y2-dy*r]
    }

    // Return SVG path data that draws from current position (which should be on the line x1,y1-->x2,y2) around the
    // corner x2,y2 towards x3,y3. This draws straight line to the start of the curve, and finishes at the end of
    // the curve, allowing it to be called successively with the next set of points.
    private curveLineEnd(p1: [number, number], p2: [number, number], p3: [number, number], radius: number): string {
        // Get coords of points before and after corner where curve starts and ends.
        let [bx, by] = this.midPointCoord(p1, p2, radius)
        let [ax, ay] = this.midPointCoord(p3, p2, radius)
        return ` L ${bx} ${by} Q ${p2[0]} ${p2[1]} ${ax} ${ay}`

    }

    // Parse a path description to an svg path string, with animated moving ball to indicate flow.
    getPathSvg(startDeviceX: number, startDeviceY: number, pathDesc: string, color: string, id: string, ballRadius: number, ballSpeed: number): string {
        if(typeof(pathDesc)!="string" || pathDesc.length<2) return ""
        const commands = pathDesc.trim().split(/\s+/);
        let x = startDeviceX
        let y = startDeviceY
        let coords: [number, number][] = []
        coords.push([this.getCoordX(x), this.getCoordY(y)])
        for (const cmd of commands) {
            let [nx, ny, offset, error] = this.getNextDeviceCoords(x, y, cmd)
            if (error.length > 0) {
                console.log(error)
                return ""
            }
            x = nx
            y = ny
            coords.push([this.getCoordX(x), this.getCoordY(y)])
        }

        if (coords.length < 2) return ""

        let [sx, sy] = this.midPointCoord(coords[1], coords[0], this._circle_radius)
        let pathSvg = `M ${sx} ${sy}`;
        for (let i = 0; i < coords.length-1; i++) {
            if (i + 2 < coords.length)
                pathSvg += this.curveLineEnd(coords[i], coords[i + 1], coords[i + 2], 25)
            else {
                let [ex, ey] = this.midPointCoord(coords[i], coords[i+1], this._circle_radius)
                pathSvg += ` L ${ex} ${ey}`
            }
        }
        let keyPoints = ballSpeed >0 ? "0;1" : "1;0"

        const path = `<path id="${id}" style="stroke: ${color};" vector-effect="non-scaling-stroke" d="${pathSvg}"></path>`
        const animate = `<circle id="${id}_circle" r="${ballRadius}" style="fill: ${color};" class="grid" vector-effect="non-scaling-stroke">
                <animateMotion id="${id}_animate" repeatCount="indefinite" calcMode="linear" dur="${Math.abs(ballSpeed)}s" keyPoints="${keyPoints}" keyTimes="0;1">
                    <mpath xlink:href="#${id}"></mpath>
                </animateMotion>
            </circle>`
        return path+animate
    }

}