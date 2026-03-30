//! Headless GPU snapshot testing for GAME shaders.
//!
//! Renders compiled shaders to a texture via wgpu, captures pixel data,
//! and compares against reference images for visual regression testing.
//!
//! Enable with: `cargo build --features snapshot`
//!
//! Note: Requires a GPU-capable environment. CI should use `swiftshader`
//! or `lavapipe` as a software Vulkan driver.

use std::path::Path;

use image::{ImageBuffer, Rgba};
use wgpu::util::DeviceExt;

/// Headless GPU renderer for visual snapshot testing.
pub struct SnapshotRenderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
}

impl SnapshotRenderer {
    /// Create a new renderer using the best available GPU.
    pub fn new() -> Result<Self, String> {
        let instance = wgpu::Instance::default();
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            ..Default::default()
        }))
        .ok_or("no GPU adapter found")?;

        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("snapshot"),
                ..Default::default()
            },
            None,
        ))
        .map_err(|e| format!("device request failed: {e}"))?;

        Ok(Self { device, queue })
    }

    /// Render a compiled WGSL shader at the given resolution and time.
    ///
    /// Returns raw RGBA pixel data (width * height * 4 bytes).
    pub fn render_frame(
        &self,
        wgsl_source: &str,
        width: u32,
        height: u32,
        time: f32,
        uniform_count: usize,
    ) -> Result<Vec<u8>, String> {
        let format = wgpu::TextureFormat::Rgba8UnormSrgb;

        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("snapshot-target"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Build uniform buffer: [time, 0..9 reserved, ...user_params]
        let mut uniform_floats: Vec<f32> = vec![
            time,              // [0] time
            0.0,               // [1] audio_bass
            0.0,               // [2] audio_mid
            0.0,               // [3] audio_treble
            0.0,               // [4] audio_energy
            0.0,               // [5] audio_beat
            width as f32,      // [6] resolution.x
            height as f32,     // [7] resolution.y
            0.0,               // [8] mouse.x
            0.0,               // [9] mouse.y
        ];
        // Pad to uniform_count
        while uniform_floats.len() < 10 + uniform_count {
            uniform_floats.push(0.0);
        }
        let uniform_bytes = floats_to_bytes(&uniform_floats);

        let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("uniforms"),
            contents: &uniform_bytes,
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let shader = self
            .device
            .create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("game-shader"),
                source: wgpu::ShaderSource::Wgsl(wgsl_source.into()),
            });

        let pipeline = self
            .device
            .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("game-pipeline"),
                layout: None,
                vertex: wgpu::VertexState {
                    module: &shader,
                    entry_point: Some("vs_main"),
                    buffers: &[],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &shader,
                    entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleStrip,
                    ..Default::default()
                },
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview: None,
                cache: None,
            });

        let bind_group_layout = pipeline.get_bind_group_layout(0);
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("game-bind"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let bytes_per_row = width * 4;
        let padded_bytes_per_row = ((bytes_per_row + 255) / 256) * 256;
        let readback_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: (padded_bytes_per_row * height) as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("snapshot-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                ..Default::default()
            });
            pass.set_pipeline(&pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..4, 0..1);
        }

        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &readback_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        self.queue.submit(Some(encoder.finish()));

        let slice = readback_buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });
        self.device.poll(wgpu::Maintain::Wait);
        receiver
            .recv()
            .map_err(|e| format!("map recv error: {e}"))?
            .map_err(|e| format!("map error: {e}"))?;

        let data = slice.get_mapped_range();
        let mut pixels = Vec::with_capacity((width * height * 4) as usize);
        for row in 0..height {
            let start = (row * padded_bytes_per_row) as usize;
            let end = start + (width * 4) as usize;
            pixels.extend_from_slice(&data[start..end]);
        }
        drop(data);
        readback_buffer.unmap();

        Ok(pixels)
    }
}

/// Save RGBA pixel data as a PNG file.
pub fn save_png(pixels: &[u8], width: u32, height: u32, path: &Path) -> Result<(), String> {
    let img: ImageBuffer<Rgba<u8>, _> =
        ImageBuffer::from_raw(width, height, pixels.to_vec())
            .ok_or("invalid pixel dimensions")?;
    img.save(path).map_err(|e| format!("PNG save error: {e}"))
}

/// Load a PNG file and return RGBA pixel data.
pub fn load_png(path: &Path) -> Result<(Vec<u8>, u32, u32), String> {
    let img = image::open(path).map_err(|e| format!("PNG load error: {e}"))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    Ok((rgba.into_raw(), w, h))
}

/// Compare two RGBA pixel buffers. Returns similarity percentage (0-100).
pub fn compare_pixels(actual: &[u8], reference: &[u8], channel_threshold: i32) -> f64 {
    if actual.len() != reference.len() || actual.is_empty() {
        return 0.0;
    }
    let total_pixels = actual.len() / 4;
    let mut matching = 0usize;
    for i in 0..total_pixels {
        let base = i * 4;
        let dr = (actual[base] as i32 - reference[base] as i32).abs();
        let dg = (actual[base + 1] as i32 - reference[base + 1] as i32).abs();
        let db = (actual[base + 2] as i32 - reference[base + 2] as i32).abs();
        if dr <= channel_threshold && dg <= channel_threshold && db <= channel_threshold {
            matching += 1;
        }
    }
    (matching as f64 / total_pixels as f64) * 100.0
}

/// Generate a visual diff image highlighting differing pixels in red.
pub fn generate_diff(actual: &[u8], reference: &[u8]) -> Vec<u8> {
    let mut diff = Vec::with_capacity(actual.len());
    let total_pixels = actual.len() / 4;
    for i in 0..total_pixels {
        let base = i * 4;
        if base + 3 >= actual.len() || base + 3 >= reference.len() {
            break;
        }
        let dr = (actual[base] as i32 - reference[base] as i32).abs();
        let dg = (actual[base + 1] as i32 - reference[base + 1] as i32).abs();
        let db = (actual[base + 2] as i32 - reference[base + 2] as i32).abs();
        if dr > 2 || dg > 2 || db > 2 {
            diff.extend_from_slice(&[255, 0, 0, 255]);
        } else {
            diff.push(actual[base] / 3);
            diff.push(actual[base + 1] / 3);
            diff.push(actual[base + 2] / 3);
            diff.push(255);
        }
    }
    diff
}

fn floats_to_bytes(floats: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(floats.len() * 4);
    for f in floats {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    while bytes.len() % 16 != 0 {
        bytes.extend_from_slice(&0.0f32.to_le_bytes());
    }
    bytes
}
