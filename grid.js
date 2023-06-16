///////// GENERAL SETUP
const canvas = document.getElementById("grid");
if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
};

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
};

const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu");

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: canvasFormat,
});
///////// GENERAL SETUP

///////// SETUP INTERFACE TO RECORD GPU COMMANDS
const encoder = device.createCommandEncoder();

// Render passes are when all drawing operations in WebGPU happen
const pass = encoder.beginRenderPass({
    colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear", // load or clear 
        clearValue: { r: 0, g: 1, b: 1, a: 1 }, // ignored if loadOp isn't clear
        storeOp: "store", // store or discard
    }]
});
///////// SETUP INTERFACE TO RECORD GPU COMMANDS

///////// WGSL
const cellShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;

    @vertex
    fn vertexMain(@location(0) pos: vec2f, @builtin(instance_index) instance: u32) -> @builtin(position) vec4f {

        let i = f32(instance);
      
        let cell = vec2f(i % grid.x, floor(i / grid.x));

        let cellOffset = cell / grid * 2;
        let gridPos = (pos + 1) / grid - 1 + cellOffset;

        return vec4f(gridPos, 0, 1);
    }

    @fragment
    fn fragmentMain() -> @location(0) vec4f {
        return vec4f(1, 0.7, 0.7, 1);
    }
    `
});
///////// WGSL

///////// INNER SQUARE SETUP
const vertices = new Float32Array([
//    -1, 1,
//    0, 1,
//    -1, 0,
//
//    1, 1,
//    0, 1,
//    1, 0,
//
//    -1, -1,
//    -1, 0,
//    0, -1,
//
//    1, 0,
//    1, -1,
//    0, -1,
//
//    0, 0.2,
//    -0.2, 0,
//    .2, 0,
//
//    0, -0.2,
//    -0.2, 0,
//    0.2, 0


    -0.8, -0.8,
    0.8, -0.8,
    0.8, 0.8,
    -0.8, -0.8,
    0.8, 0.8,
    -0.8, 0.8,
]);

const vertexBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);

const vertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0,
    }],
};

const cellPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: "auto",
    vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [{
            format: canvasFormat
        }]
    }
});

pass.setPipeline(cellPipeline);
pass.setVertexBuffer(0, vertexBuffer);
///////// INNER SQUARE SETUP


///////// GRID SETUP
const GRID_SIZE = 6;

// Uniform buffer
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

const bindGroup = device.createBindGroup({
    label: "Cell renderer bind group",
    layout: cellPipeline.getBindGroupLayout(0),
    entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer }
    }],
});

// each binding that is part of group 0 uses the resources in this bind group
pass.setBindGroup(0, bindGroup);

///////// GRID SETUP


///////// Send Commands

pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

// end render pass
pass.end();

// Submit command buffer to GPU
// This queue performs all GPU commands
// submit accepts an array of command buffers
device.queue.submit([encoder.finish()]);

