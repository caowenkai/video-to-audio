# Bilibili 视频下载说明

## 技术实现方案

### ✅ 可以实现，无需官方 API

当前实现使用 **yt-dlp**（youtube-dl 的改进版），这是一个开源工具，**不需要 Bilibili 官方 API**。

### 工作原理

1. **yt-dlp 通过以下方式工作**：
   - 解析 Bilibili 网页，提取视频信息
   - 获取视频流的真实地址（类似浏览器播放）
   - 下载视频文件到本地
   - 然后使用 FFmpeg 提取音频

2. **不需要官方 API 的原因**：
   - yt-dlp 模拟浏览器行为，直接访问视频流
   - 不依赖任何官方接口
   - 是合法的网页内容访问方式

## 支持情况

### ✅ 支持的视频类型

- ✅ 公开视频（无需登录）
- ✅ 普通会员视频（需要 cookies）
- ✅ 大部分 Bilibili 视频格式

### ⚠️ 可能遇到的问题

1. **需要登录的视频**：
   - 某些视频需要登录或会员权限
   - 解决方案：可以配置 cookies（见下方）

2. **反爬虫机制**：
   - Bilibili 可能会检测并限制频繁下载
   - 解决方案：已添加 User-Agent 模拟浏览器

3. **地区限制**：
   - 某些视频可能有地区限制
   - 解决方案：可能需要代理

4. **版权保护**：
   - 某些视频可能有特殊保护
   - 解决方案：yt-dlp 会尝试多种方法

## 使用限制和注意事项

### ⚠️ 重要提醒

1. **遵守使用条款**：
   - 仅用于个人学习、研究
   - 不要用于商业用途
   - 尊重内容创作者版权

2. **技术限制**：
   - 下载速度取决于网络
   - 大视频文件可能需要较长时间
   - 某些特殊格式可能不支持

3. **法律风险**：
   - 下载受版权保护的内容可能违法
   - 请确保你有权下载和使用该内容

## 高级配置（可选）

### 如果需要下载需要登录的视频

1. **导出 Cookies**：
   - 使用浏览器扩展（如 "Get cookies.txt LOCALLY"）
   - 导出 Bilibili 的 cookies 文件

2. **修改代码使用 Cookies**：
   ```javascript
   const downloadCommand = `${ytdlpCommand} --cookies /path/to/cookies.txt -f "best" -o "${escapedVideoPath}" "${url}"`;
   ```

### 如果需要更好的兼容性

可以添加更多 yt-dlp 参数：
```javascript
const downloadCommand = `${ytdlpCommand} \
  -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" \
  --no-playlist \
  --user-agent "Mozilla/5.0..." \
  --referer "https://www.bilibili.com" \
  -o "${escapedVideoPath}" \
  "${url}"`;
```

## 测试建议

1. **先测试公开视频**：
   - 使用一个公开的、不需要登录的视频测试
   - 确认功能正常工作

2. **检查 yt-dlp 版本**：
   ```bash
   yt-dlp --version
   ```
   - 建议使用最新版本（定期更新以应对 Bilibili 的变化）

3. **更新 yt-dlp**：
   ```bash
   # macOS
   brew upgrade yt-dlp
   
   # Linux/Windows
   pip install --upgrade yt-dlp
   ```

## 总结

✅ **可以实现**：使用 yt-dlp 无需官方 API  
✅ **技术可行**：通过解析网页和视频流下载  
⚠️ **需要注意**：遵守版权、可能需要处理登录/会员视频  
🔄 **需要维护**：yt-dlp 需要定期更新以应对平台变化


