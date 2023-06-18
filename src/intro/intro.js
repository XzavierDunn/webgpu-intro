///////// GENERAL SETUP
const canvas = document.getElementById("intro");
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

const cellShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: `
    @vertex
    fn vertexMain(@location(0) pos: vec2f) -> @builtin(position) vec4f {
        return vec4f(pos, 0, 1);
    }

    @fragment
    fn fragmentMain() -> @location(0) vec4f {
        return vec4f(1, 0.7, 0.7, 1);
    }
    `
});

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
pass.draw(vertices.length / 2);
///////// INNER SQUARE SETUP

///////// Send Commands
// end render pass
pass.end();

// Submit command buffer to GPU
// This queue performs all GPU commands
// submit accepts an array of command buffers
device.queue.submit([encoder.finish()]);

