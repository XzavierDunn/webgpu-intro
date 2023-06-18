///////// GENERAL SETUP
const canvas = document.getElementById("grid");
if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}; const adapter = await navigator.gpu.requestAdapter();
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
        clearValue: { r: 1, g: 1, b: 1, a: 1 }, // ignored if loadOp isn't clear
        storeOp: "store", // store or discard
    }]
});
///////// SETUP INTERFACE TO RECORD GPU COMMANDS

///////// WGSL
const cellShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: `
    struct VertexInput {
        @location(0) pos: vec2f,
        @builtin(instance_index) instance: u32,
    };

    struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) cell: vec2f,
    };

    @group(0) @binding(0) var<storage> grid: vec2f;

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
        let i = f32(input.instance);
        let cell = vec2f(i % grid.x, floor(i / grid.x));
        let cellOffset = cell / grid * 2;
        let gridPos = (input.pos + 1) / grid - 1 + cellOffset;

        var output: VertexOutput;
        output.pos = vec4f(gridPos, 0, 1);
        output.cell = cell;

        return output;
    }

    @fragment
    fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
        let c = input.cell / grid;
        return vec4f(c, 1-c.y, 1);
    }
    `
});
///////// WGSL

///////// INNER SQUARE SETUP
const vertices = new Float32Array([
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


let step = 0;
let GRID_SIZE = 32;
function updateGrid() {
    step++;
    
    let gridInput = document.getElementById("grid-input");
    gridInput.value = GRID_SIZE;
    let handleInput = (event) => {
        GRID_SIZE = event.target.value;
    };

    gridInput.addEventListener("input", handleInput);

    // Uniform buffer
    const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    const uniformBuffer = device.createBuffer({
        label: "Grid Uniforms",
        size: uniformArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear", 
            clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 }, 
            storeOp: "store", 
        }]
    });

    pass.setPipeline(cellPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

    pass.end();
    device.queue.submit([encoder.finish()]);
};

setInterval(updateGrid, 200);

