# power-energy-flow-card-multi
A power (and in the future energy) distribution card with support for multiple batteries, generation sources and inverters, and complete control over where each device is displayed and how they connect.

[!sample card](doc/card.png)

## Goal

This is yet another recreation of the power flow card seen in the Homeassistant energy dashboard. [Power-Flow-Plus](https://github.com/fano0001/power-flow-card-plus?tab=readme-ov-file) is great, but doesn't let you visualise complicated setups with more than one battery or more than one inverter. At present this is still a work in progress, but is now usable (for power flows not energy).

The primary goal is configurability, and this is pursued at the expense of usability. If the existing energy dashboards do what you need then use them. The aim is to be able to configure a power flow card that looks however you want in terms of how many items, and how they are connected to each other. We support an unlimited number of inverters, batteries and panels, with connection lines drawn as you want

## Configuration overview

### Global configuration

This is straightforward. Currently the only valid keys are *title*, *circle_radius* and *devices*. The main configuration all goes on within the individual devices.

### Device configuration

A device is represented by a circle. Devices are laid out in a grid, numbered from 0,0 in the top left corner. Each square on the grid has space for one device, so the energy distribution card in the main homeassistant would be considered a 3 x 3 grid. Each device has to have its position specified using *xPos* and *yPos*. These coordinates can be fractional, so if you had a 5x2 grid you could position a device in the middle by using *xPos: 2* and *yPos: 0.5*. But there wouldn't be space to position a device above or below this (you can try, and we don't stop you, but it will look terrible). The grid automatically adjusts its size to accomodate all the defined devices.

A device must have at least one entity that defines its power flow. This can be placed in *power_source* if the number is +ve when the device is supplying power (eg. grid import, solar generation, battery discharge), or placed in *power_sink* if it is +ve when the device is consuming power (grid export, battery charge, or load).

Each of *power_source* and *power_sink* can contain a list of entities rather than a single one, and if both are defined then power_sinks will be subtracted from the power_sources to work out net power. This gives flexibility for using existing entities without needing to create helper sensors. If the sign is wrong on a sensor then just move it from *power_source* to *power_sink* or vice versa. If one CT clamp measures power to multiple devices, some of which have their own downstream entities for power measurement, then you can use this to separate everything out.

Required keys for each device are: *xPos*, *yPos*, *id* (must be a unique id string for this card), and at least one of *power_source* or *power_sink*.
Optionally you can also have *max_power* (used to know how to scale animations), *connections* (see below), *name* (what is displayed - defaults to *id*), and *icon*.

### Connections

Connections are the lines that you see between devices with the little animated balls moving along them.
A connection has two essential keys in the config: *desc* *target*. *target* contains the *id* of the device that the other end of this line's power flow will go to. This is used for working out how much power to show going down the line, but has nothing to do with where the line is drawn. Drawing the line is the responsibility of *desc*, and this can make the line go wherever you want. I strongly recommend making sure it goes to the target, but you don't have to.

Additionally a connection can contain optional keys *color*, and *mode*. *mode* can be "onedirection" for a connection that only moves power away from this device, or "reverse" for a connection that only moves power towards this device. All other devices are assumed to be bi-directional.

#### Line descriptions

A line description is a whitespace delineated sequence of tokens that describe a direction to move in and a relative distance. The first character of each token is the direction, encoded by a number as per the numeric keypad used as directional arrow keys (8=up, 2=down, 7=diagonally up and left etc.). The remaining numbers describe a distance (measured in grid-squares) to move. For diagonal lines we will move that distance in both horizontal and vertical directions (so "31" is the *desc* required to draw a line joining a device with one diagonally one space down and to the right of it).

Fractional movements are also allowed. "30.5 61 90.5" will draw from the device (centre of grid square) down to the bottom right corner of it, one square to the right, and then diagonally back up again, joining to a device exactly two grid squares to the right of us. "20.6 62 80.6" goes straight down, across 2 squares, and then straight back up. It reaches the same place, but the lines don't touch because we've gone down slightly further.

This is very flexible and takes some time to set up how you want it, but can then be left alone.

#### Power flow calculations
If at any one time there is more than one power source and more than one power sink (eg. solar generation, and battery discharging, while exporting and using electricity) attached to the same grid then it is not well defined which power is going where. We currently prioritise based on the order devices and connections appear in the configuration. So first device is shown as sending as much available power along its first connection as the other end is able to receive, and then works down its list of connections. Then we move to the next device. If this matters to you then you should be able to arrange the config file so this works.

# Todo
We ignore losses in the system. They are hopefully too small to be visible in the visualisations, and it doesn't matter if things don't quite add up. May add a special device type with no entity that takes any spare power, allowing us to record loads that no entity monitors for example.

Energy monitoring. Shares much of the same drawing code, but need to calculate values differently, and display both inwards and outwards flows in each box.

Additional configuration (battery charge %s, configure whole devices as sources, sinks or both). Use circle of devices for pie charts in various ways. Vary icon depending on battery charge state.

Path offsets. We want to be able to have more than one path coming out of a circle, heading in the same direction, without being on top of each other. Will look neater if they're parallel though. If a path can be offset by 0.1-0.4 x circle_radius either up, down, left or right, it will still intersect with the circle. And will still intersect with the destination circle. But will leave at a different point from a non offset. I think I'll do this using hjklyubn as direction modifiers followed by 1-4 for 0.1-0.4 as the first token of the path. (so j1 is a path offset downwards along it's length by 0.1 circle_radius). Niche, but useful for some complex setups, and can be ignored by anyone who isn't interested.

Example configs, better pictures. Work in HACS