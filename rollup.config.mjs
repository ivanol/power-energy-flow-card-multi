import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
    input: 'src/index.ts',
    output: [
	{
            file: 'dist/power-energy-flow-card-multi.js',
            format: 'cjs'
        },
	{
            file: 'dist/power-energy-flow-card-multi.min.js',
            format: 'iife',
	    plugins: [terser()]
        }
    ],
    plugins: [typescript()],
}
