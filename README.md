# power-energy-flow-card-multi
A power (and in the future energy) distribution card with support for multiple batteries, generation sources and inverters, and complete control over where each device is displayed and how they connect.

![sample card](https://raw.githubusercontent.com/ivanol/power-energy-flow-card-multi/refs/heads/main/doc/card.png)

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
If at any one time there is more than one power source and more than one power sink (eg. solar generation, and battery discharging, while exporting and using electricity) attached to the same grid then it is not well defined which power is going where. We try to work this out heuristically, but this may not be perfect. If results are consistently wrong you can try re-ordering devices and connections in the config file - we prioritise those nearer the top.

### Display settings
The available display settings currently are *color*, *circle_radius* and *hidden*. We intend to add *size* for scaling text/icons/lines, but it has not been done yet. Display entries can appear either in a device, or in the root of the config for global defaults.
A display entry is a key in the form *display* *display-TYPE* *display-TYPE-STATUS* or *display-STATUS*. TYPE can be *circle*, *text* or *icon* and limits the display entry to just affecting that part of the device. STATUS can be *source* *sink* *active* or *inactive*, and will limit these display rules to running when the relevant device is in this mode.
A device can have multiple display rules within it, and the most specific one will be used. So if the device is a solar panel currently producing power we first look for *device-source* then *device-active* then *device*. If there is no match we look for each of these in term in the global config. If nothing matches we fall back to the defaults.

## Complex/complete example
The following should demonstrate all the available features, and will produce an image approximately like this.

The above config will produce a card looking something like this ![sample card](https://raw.githubusercontent.com/ivanol/power-energy-flow-card-multi/refs/heads/main/doc/card2.gif)

```yaml
type: custom:power-energy-flow-multi
title: Power Flow
display-icon-source:   # Default display settings for icons in devices producing power
  color: orange
display-circle-source: # Make the circle orange too.
  color: orange
display-text-sink:     # If the device is consuming power we make the text red.
  color: red
display-inactive:      # Grey everything (circle, text and icon) if power flow is 0.
  color: grey
devices:
  - id: grid
    name: Grid
    xPos: 0
    yPos: 1
    power_sink: sensor.feed_in                # Split feed_in and consumption will be
    power_source: sensor.grid_consumption     # combined
    icon: mdi:transmission-tower
    floor: 0.05                               # We truncate to 0 if less than this
    max_power: 15                             # Used to scale flow animations
    display-source:
      color: red     # This overrides the global display above, so grid shows red if we're
    display-sink:    # importing. display-text-sink would just affect the text, but
      color: green   # display-sink will color circle, icon, and text green.
  - id: battery
    name: Battery
    xPos: 1
    yPos: 2
    power_source: sensor.battery_power        # Omit icon and provide a percent_entity
    max_power: 7                              # to get a battery icon that changes with
    percent_entity: sensor.battery_soc        # state of charge
  - id: solarw
    name: West Solar
    xPos: 0
    yPos: 0
    power_source: sensor.west_solar_panels
    icon: mdi:solar-power-variant-outline
  - id: inverter2
    name: Inverter 2
    icon: mdi:generator-stationary
    xPos: 1
    yPos: 0
    power_source: sensor.west_solar_panels
  - id: inverter1
    name: Inverter 1
    icon: mdi:generator-stationary
    xPos: 1
    yPos: 1
    max_power: 7
    power_source:
      - sensor.invbatpower          # These two entities will be summed.
      - sensor.pv_power
    connections:
      - desc: 21                    # Down line one grid square
        target: battery
        internal: true              # Means it's describing where the inverter
        color: cyan                 # gets its power from. We don't add the power
      - desc: 11                    # from battery to the inverters power.
        target: swsolar
        color: orange
        internal: true
      - desc: 31                    # Draw line down/right by one square.
        target: sesolar             # target determines power flow for the calculations. But has
        color: orange               # no effect on the direction the line is drawn in
        internal: true
      - desc: 61
        target: home
        color: green
      - desc: 41
        target: grid
        color: green
  - id: swsolar
    name: SWSolar
    icon: mdi:solar-power-variant
    xPos: 0
    yPos: 2
    power_source: sensor.pv1_power
  - id: sesolar
    icon: mdi:solar-power-variant
    name: SESolar
    xPos: 2
    yPos: 2
    power_source: sensor.pv2_power
  - id: home
    name: House Load
    xPos: 2
    yPos: 1
    power_sink: sensor.load_power
    max_power: 10
    icon: mdi:home-lightning-bolt-outline
    connections:
      - desc: 81
        target: kitchen
        internal: true
        color: red
      - desc: 91
        target: car
        internal: true
        color: red
      - desc: 31
        target: heating
        internal: true
        color: red
  - id: kitchen
    name: Kitchen
    xPos: 2
    yPos: 0
    icon: mdi:food-fork-drink
    power_sink:
      - sensor.cooker                        # Lets combine lots of entities to have
      - sensor.air_fryer                     # an overall cooking-stuff load.
      - sensor.fridge_freezer_plug_power
      - sensor.dish_washer_power
  - id: car
    name: Car
    xPos: 3
    yPos: 0
    icon: mdi:car-electric                      # We can have a percentage next to
    percent_entity: sensor.tesla_battery_level  # any device.
    power_sink:
      - sensor.car_charger_power
    display-icon:
      color: red # Our car is red
  - id: heating
    xPos: 3
    yPos: 2
    icon: mdi:heating-coil
    power_sink: sensor.heatpump_power
    display-inactive:
      hidden: true # Lets hide this device altogether when the heating is off.
  - id: garagesolar
    name: Garage Solar
    xPos: 4
    yPos: 0
    power_source: sensor.garage_pv_power
    icon: mdi:solar-power-variant
    connections:
      - target: garage
        desc: 21
        color: green
  - id: garage
    name: Off Grid Garage
    icon: mdi:warehouse
    xPos: 4
    yPos: 1
    power_source: sensor.garage_export_power
    max_power: 5
    connections:
      - desc: 21
        target: garagebattery
        color: cyan
  - id: garagebattery
    name: Garage
    xPos: 4
    yPos: 2
    power_source: sensor.garage_battery_power
    percent_entity: sensor.garage_battery_soc
grid_options:
  columns: 24 # Nice and wide - can increase this if we have xPos going higher than 4.
  rows: auto
```


# Todo
We ignore losses in the system. They are hopefully too small to be visible in the visualisations, and it doesn't matter if things don't quite add up. May add a special device type with no entity that takes any spare power, allowing us to record loads that no entity monitors for example.

Energy monitoring. Shares much of the same drawing code, but need to calculate values differently, and display both inwards and outwards flows in each box.

Additional configuration (battery charge %s, configure whole devices as sources, sinks or both). Use circle of devices for pie charts in various ways. Vary icon depending on battery charge state.

Path offsets. We want to be able to have more than one path coming out of a circle, heading in the same direction, without being on top of each other. Will look neater if they're parallel though. If a path can be offset by 0.1-0.4 x circle_radius either up, down, left or right, it will still intersect with the circle. And will still intersect with the destination circle. But will leave at a different point from a non offset. I think I'll do this using hjklyubn as direction modifiers followed by 1-4 for 0.1-0.4 as the first token of the path. (so j1 is a path offset downwards along it's length by 0.1 circle_radius). Niche, but useful for some complex setups, and can be ignored by anyone who isn't interested.

Config checking for more esoteric gotchas: Circular connections, misuse of "internal" (with a route back to the other side), target and desc pointing to different nodes.

Work in HACS
