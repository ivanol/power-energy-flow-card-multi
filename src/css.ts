export const css: string = `
    .error {
        text-color: red;
    }
    .error.hidden { display: none; }

    .circle-contents {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        line-height: 0.8;
     }

  ha-icon.small {
    --mdc-icon-size: 12px;
  }

  path {
    stroke: var(--disabled-text-color);
    stroke-width: 1;
    fill: none;
  }
  circle.solar,
  path.solar {
    stroke: var(--energy-solar-color);
  }
  .hidden {
    display: none;
  }
`;

