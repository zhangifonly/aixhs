import { COMFYUI_URL } from '../src/lib/api-config.js';

async function main() {
  console.log('COMFYUI_URL:', COMFYUI_URL);
  
  try {
    console.log('尝试连接...');
    const response = await fetch(`${COMFYUI_URL}/system_stats`, {
      signal: AbortSignal.timeout(10000)
    });
    console.log('响应状态:', response.status);
    console.log('响应OK:', response.ok);
    const data = await response.json();
    console.log('数据:', JSON.stringify(data).slice(0, 200));
  } catch (error) {
    console.error('错误:', error);
  }
}

main().catch(console.error);
