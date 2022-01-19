var g = {};
const config = {
    agents: null,
    canvas: null,
    pointSize: 2.0,
    turnSpeed: 0.2,
    moveSpeed: 0.002,
    fadeSpeed: 0.05
};

/*
The general idea here is to store the agent's index, position and angle in a texture,
then run the fragment shader on it, which will ensure each agent gets processed, 
which will calculate their new position based on their current velocity,
checking for edge of screen bounces and so on

                ============FRAME START============
                ↑ READ agentTex_ (read agent position)
                | WRITE agentTex (write new agent position)
    moveAgent → |
                | READ renderTex (read surrounding pixels)
                ↓ WRITE agentTex (update direction based on sense)
                
                ↑ READ agentTex (read agent position)
  renderAgent → ↓ WRITE renderTex (write agents onto render buffer)

                ↑ READ renderTex
                ↓ WRITE renderTex_ (do post processing)
                ============FRAME END============

NOTE:
Potentially create a big vertex buffer with a coordinates to each pixel in agentTex.
Then a vertex shader in renderAgent will run for each vertex and set gl_Position to the sampled x & y
value at that pixel.
*/

function init()
{
    const canvas = document.getElementById("vis");
    config.canvas = canvas;

    // 16384 max texture size
    
    config.agents = [];
    for (let i = 0; i < 4096; i++) config.agents.push({
        x: 0.5,
        y: 0.5,
        rot: (Math.random() * (0.0 - 2*Math.PI) + 2*Math.PI).toFixed(4)
    });

    const gl = canvas.getContext("webgl2", {preserveDrawingBuffer: true});
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) {
        alert("EXT_color_buffer_float failed to load");
    return;
    }

    const shaders = setupShaders(gl);
    setupAgentControl(gl, config, shaders);
}

function setupShaders(gl)
{
    // pasthrough shader
    const moveAgentVertSrc = `#version 300 es
    precision mediump float;
    in vec2 m_position;
    out vec2 v_texCoord;

    void main(void)
    {
        gl_Position = vec4(m_position, 0.0, 1.0);
        v_texCoord = m_position.xy * 0.5 + 0.5; // range to [-1, 1]
    }`;

    // Calculates new x, y and r values for the agent state texture
    const moveAgentFragSrc = `#version 300 es
    precision mediump float;
    precision mediump int;
    precision mediump sampler2D;

    uniform sampler2D agentTex;
    uniform sampler2D renderTex;
    in vec2 v_texCoord;

    const float moveSpeed = ` + config.moveSpeed.toFixed(4) + `;
    const float turnSpeed = ` + config.turnSpeed.toFixed(4) + `;
    const float width = ` + config.canvas.width.toFixed(1) + `;
    const float height = ` + config.canvas.height.toFixed(1) + `;
    const float sensorRadius = 0.02;
    const float sensorOffsetDistance = 0.02;

    out vec4 result;

    uint hash(uint x);
    uint hash(uint x)
    {
        x ^= 2747636419u;
        x *= 2654435769u;
        x ^= x >> 16;
        x *= 2654435769u;
        x ^= x >> 16;
        x *= 2654435769u;
        return x;
    }

    float sense(float x, float y, float r, float offset);
    float sense(float x, float y, float r, float offset)
    {
        float sensorAngle = r + offset;
        vec2 sensorDirection = vec2(cos(sensorAngle), sin(sensorAngle));
        vec2 sensorCentre = vec2(x, y) + sensorDirection * sensorOffsetDistance;
        float sum = 0.0;
        for (float i = -sensorRadius; i <= sensorRadius; i += 1.0/width)
        {
            for (float j = -sensorRadius; j <= sensorRadius; j += 1.0/height)
            {
                vec4 reading = texture(renderTex, sensorCentre + vec2(i, j));
                sum += reading.x;
            }
        }
        return sum;
    }

    void main(void)
    {
        uint pixelIndex = uint((gl_FragCoord.y * width) + (gl_FragCoord.x));
        float pseudoRandomNumber = float(hash(pixelIndex)) / 4294967295.0; // normalise

        float x = texture(agentTex, v_texCoord).x;
        float y = texture(agentTex, v_texCoord).y;
        float r = texture(agentTex, v_texCoord).z;

        // move agent along current path
        x += cos(r) * moveSpeed;
        y += sin(r) * moveSpeed;

        // check boundaries and reflect angle if hit
        if (x < 0.0 || x > 1.0 || y < 0.0 || y > 1.0)
        {
            x = min(0.99, max(0.0, x));
            y = min(0.99, max(0.0, y));
            //r += pseudoRandomNumber * 3.141;
            r += 3.141;
        }

        
        float forwardReading = sense(x, y, r, 0.0);
        float leftReading = sense(x, y, r, 1.0);
        float rightReading = sense(x, y, r, -1.0);

        if (forwardReading > leftReading && forwardReading > rightReading) r += 0.0;
        else if (forwardReading < leftReading && forwardReading < rightReading) r += (pseudoRandomNumber-0.5) * turnSpeed;
        else if (rightReading > leftReading) r -= pseudoRandomNumber * turnSpeed;
        else if (rightReading < leftReading) r += pseudoRandomNumber * turnSpeed;

        result = vec4(vec3(x, y, r), 1.0);
    }`;

    // Runs for each vertex defined over a pixel in the agent state texture
    // to get the R and G (x and y position) values and passes that through
    // for the fragment shader to draw those pixels
    const renderAgentVertSrc = `#version 300 es
    precision mediump float;
    
    in vec2 r_position;
    in float r_agentCoord;
    
    precision mediump sampler2D;
    uniform sampler2D agentTex;
    
    out vec4 agent;

    void main(void)
    {
        // get the r & g (x & y positions) value of pixels in agentTex
        float x = texture(agentTex, vec2(r_agentCoord, 0.5)).r;
        float y = texture(agentTex, vec2(r_agentCoord, 0.5)).g;
        agent = texture(agentTex, vec2(r_agentCoord, 0.5));

        gl_Position = vec4(2.0 * x - 1.0, 2.0 * y - 1.0, 0.0, 1.0);
        gl_PointSize = ` + config.pointSize.toFixed(2) + `;
    }`;

    const renderAgentFragSrc = `#version 300 es
    precision mediump float;
    precision mediump int;
    precision mediump sampler2D;

    in vec4 agent;
    uniform sampler2D agentTex;
    out vec4 color;

    void main(void)
    {
        color = vec4(0.282, 0.909, 1.0, 1.0);
    }`;

    const postProcessingVertSrc = `#version 300 es
    precision mediump float;
    in vec2 m_position;
    out vec2 v_texCoord;

    void main(void)
    {
        gl_Position = vec4(m_position, 0.0, 1.0);
        v_texCoord = m_position.xy * 0.5 + 0.5;
    }`;

    const postProcessingFragSrc = `#version 300 es
    precision mediump float;
    precision mediump sampler2D;

    const float fadeSpeed = ` + config.fadeSpeed.toFixed(4) + ` * 0.001;
    const float width = ` + config.canvas.width.toFixed(1) + `;
    const float height = ` + config.canvas.height.toFixed(1) + `;
    const float weight = 4.0;
    

    in vec2 v_texCoord;
    uniform sampler2D renderTex;

    out vec4 color;

    void main(void)
    {
        color = texture(renderTex, v_texCoord);
        // Gaussian Blur: https://www.shadertoy.com/view/Xltfzj
        float Pi = 6.28318530718; // Pi*2
    
        // GAUSSIAN BLUR SETTINGS {{{
        float Directions = 4.0; // BLUR DIRECTIONS (Default 16.0 - More is better but slower)
        float Quality = 3.0; // BLUR QUALITY (Default 4.0 - More is better but slower)
        float Size = 3.0; // BLUR SIZE (Radius)
        // GAUSSIAN BLUR SETTINGS }}}
    
        vec2 Radius = Size/vec2(width, height);
        
        // Blur calculations
        for( float d=0.0; d<Pi; d+=Pi/Directions)
        {
            for(float i=1.0/Quality; i<=1.0; i+=1.0/Quality)
            {
                color += texture( renderTex, v_texCoord+vec2(cos(d),sin(d))*Radius*i);		
            }
        }
       
        // Output to screen
        color /= Quality * Directions - 2.8;

        // Fade each trailing agent pixel out over time
        color = color - fadeSpeed;
    }`;

    const moveAgentProg = compileShaders(gl, moveAgentVertSrc, moveAgentFragSrc);
    const pMoveAgentAgentTex = gl.getUniformLocation(moveAgentProg, "agentTex");
    const pMoveAgentRenderTex = gl.getUniformLocation(moveAgentProg, "renderTex");

    const renderAgentProg = compileShaders(gl, renderAgentVertSrc, renderAgentFragSrc);
    const pRenderAgentAgentTex = gl.getUniformLocation(renderAgentProg, "agentTex");

    const postProcessingProg = compileShaders(gl, postProcessingVertSrc, postProcessingFragSrc);
    const pPostProcessingRenderTex = gl.getUniformLocation(postProcessingProg, "renderTex");

    return {
        moveAgentProg: moveAgentProg,
        moveAgentTextures: [pMoveAgentAgentTex, pMoveAgentRenderTex],
        renderAgentProg: renderAgentProg,
        renderAgentTextures: [pRenderAgentAgentTex],
        postProcessingProg: postProcessingProg,
        postProcessingTextures: [pPostProcessingRenderTex]
    }
}

function compileShaders(gl, vertSrc, fragSrc)
{
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vertSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vs));

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fragSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fs));

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return prog;
}

function setupAgentControl(gl, config, shaders)
{
    // Create textures for storing agent info and the render texture
    let agentData = [];
    for (let i = 0; i < config.agents.length; i++) {
        agentData.push(config.agents[i].x);
        agentData.push(config.agents[i].y);
        agentData.push(config.agents[i].rot);
        agentData.push(0.0);
    }
    agentData = new Float32Array(agentData);
    const textures = createTextures(gl, agentData);

    // Setup static texture binding
    gl.useProgram(shaders.moveAgentProg);
    gl.activeTexture(gl.TEXTURE0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, textures.renderTexture);

    var m_position = gl.getAttribLocation(shaders.moveAgentProg, 'm_position');

    var r_agentCoord = gl.getAttribLocation(shaders.renderAgentProg, 'r_agentCoord');
    var m_position_postprocess = gl.getAttribLocation(shaders.postProcessingProg, 'm_position');

    // Vertex buffer for rectangle across entire canvas
    var positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    // Give moveAgent and postProcessing access to the vertex buffer
    gl.enableVertexAttribArray(m_position);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(m_position, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribPointer(m_position_postprocess, 2, gl.FLOAT, false, 0, 0);

    // Vertex buffer with locations for each agent pixel in agentTex
    var lookupBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lookupBuffer);
    let lookupBufferData = []; // coordinates for the centre of each pixel in agentTex
    for (let i = 0; i < config.agents.length*2; i+=2) lookupBufferData.push((i+1)/(2*config.agents.length));
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lookupBufferData), gl.STATIC_DRAW);

    // Give renderAgent this buffer
    gl.enableVertexAttribArray(r_agentCoord);
    gl.bindBuffer(gl.ARRAY_BUFFER, lookupBuffer);
    gl.vertexAttribPointer(r_agentCoord, 1, gl.FLOAT, false, 0, 0);

    // create framebuffer for agent info output
    const agentFramebuffer = gl.createFramebuffer();
    const postProcessingFrameBuffer = gl.createFramebuffer();

    var ping = true;

    function tick() {
        render(ping, gl, shaders, agentFramebuffer, postProcessingFrameBuffer, textures);
        ping = !ping;
        window.requestAnimationFrame(tick);
    }
    
    window.requestAnimationFrame(tick);
}



/* createTextures:
Creates 4 textures:
    2 * agent texture (RGBA 32Float): Each pixel stores an agent's x & y positions, and their
    current rotation in the RGB values. A fragment shader will alternate between
    running on this texture and its swap, allowing it to read to one while writing to the other,
    updating their positions and check collisions.

    2 * render texture: The texture actually being drawn. This will have the
    fading + blurring effects progressively rendered onto it use the same ping pong buffer.

    In the agent shader, use texture(trailMap, vec2(x, y)), with some offsets
    to sense trails surrounding the agent, and use that to steer it.*/
function createTextures(gl, agentData)
{
    const agentTex = gl.createTexture();
    //gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, agentTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, config.agents.length, 1, 0, gl.RGBA, gl.FLOAT, agentData);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // swap texture for every 2nd frame of computation
    const agentTex_ = gl.createTexture();
    //gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, agentTex_);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, config.agents.length, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const renderTex = gl.createTexture();
    //gl.activeTexture(gl.TEXTURE0 + 2);
    gl.bindTexture(gl.TEXTURE_2D, renderTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, config.canvas.width, config.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const renderTex_ = gl.createTexture();
    //gl.activeTexture(gl.TEXTURE0 + 3);
    gl.bindTexture(gl.TEXTURE_2D, renderTex_);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, config.canvas.width, config.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return {
        agentTexture: agentTex,
        agentTextureSwap: agentTex_,
        renderTexture: renderTex,
        renderTextureSwap: renderTex_
    };
}

function render(ping, gl, shaders, agentFramebuffer, postProcessingFrameBuffer, textures)
{   
    // Ping-pong buffer: Alternate between agentTex & agentTexSwap,
    // and alternate between renderTexture and renderTextureSwap
    // Swap the agentTextures

    gl.useProgram(shaders.moveAgentProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, agentFramebuffer);

    gl.uniform1i(shaders.moveAgentTextures[0], 0); // agent texture UNIT 0 and 1
    gl.uniform1i(shaders.moveAgentTextures[1], 2); // render texture UNIT 2

    gl.viewport(0, 0, config.agents.length, 1); 
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, (ping) ? textures.agentTextureSwap : textures.agentTexture, 0);
    // set UNIT 0 to be agentTexture or agentTextureSwap
    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, (ping) ? textures.agentTexture : textures.agentTextureSwap);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);


    gl.viewport(0, 0, config.canvas.width, config.canvas.height);

    // Render to the render-texture swap
    gl.useProgram(shaders.renderAgentProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, postProcessingFrameBuffer);
    
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, (ping) ? textures.renderTextureSwap : textures.renderTexture, 0);
    gl.drawArrays(gl.POINTS, 0, config.agents.length);
    
    // Render post processing from renderTextureSwap to renderTexture
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, (ping) ? textures.renderTexture : textures.renderTextureSwap, 0);
    
    gl.useProgram(shaders.postProcessingProg);

    // set texture UNIT 0 to be the render/renderswap
    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, (ping) ? textures.renderTextureSwap : textures.renderTexture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6); // draw to screen
    gl.bindTexture(gl.TEXTURE_2D, null);
}