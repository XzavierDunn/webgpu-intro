const canvas = document.getElementById("cell-state");
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

    @group(0) @binding(0) var<uniform> grid: vec2f;
    @group(0) @binding(1) var<storage> cellState: array<u32>;

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
        let i = f32(input.instance);
        let cell = vec2f(i % grid.x, floor(i / grid.x));
        let state = f32(cellState[input.instance]);

        let cellOffset = cell / grid * 2;
        let gridPos = (input.pos*state+1) / grid - 1 + cellOffset;

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


// Uniform buffer
let GRID_SIZE = 32;
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
    label: "Grid Uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

///////// Cell Management SETUP
const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

const cellStateStorage = [
    device.createBuffer({
        label: "Cell State A",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
        label: "Cell State B",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
];

for (let i = 0; i < cellStateArray.length; i += 3) {
    cellStateArray[i] = 1;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

for (let i = 0; i < cellStateArray.length; i++ ) {
    cellStateArray[i] = i % 2;
}
device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);
///////// Cell Management SETUP

const bindGroups = [
    device.createBindGroup({
        label: "Cell renderer bind group A",
        layout: cellPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: { buffer: uniformBuffer }
            }, 
            {
                binding: 1,
                resource: { buffer: cellStateStorage[0] }
            }
        ],
    }),
    device.createBindGroup({
        label: "Cell renderer bind group B",
        layout: cellPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: { buffer: uniformBuffer }
            }, 
            {
                binding: 1,
                resource: { buffer: cellStateStorage[1] }
            }
        ],
    })
];

let step = 0;
const UPDATE_INTERVAL = 200;

function updateGrid() {
    step++;

    let gridInput = document.getElementById("grid-size");
    gridInput.value = GRID_SIZE;
    let handleInput = (event) => {
        GRID_SIZE = event.target.value;
    };
    gridInput.addEventListener("input", handleInput);

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
    pass.setBindGroup(0, bindGroups[step % 2]);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

    pass.end();
    device.queue.submit([encoder.finish()]);
};

setInterval(updateGrid, UPDATE_INTERVAL);

