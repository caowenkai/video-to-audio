import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Upload, FileAudio, Download, Trash2, Settings, CheckCircle2, XCircle, Loader2, Link } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Progress } from './components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Label } from './components/ui/label';
import { Alert, AlertDescription } from './components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';

const API_URL = 'http://localhost:3001';

interface ConversionTask {
  id: string;
  originalName: string;
  status: 'pending' | 'converting' | 'completed' | 'error';
  progress: number;
  outputFile?: string;
  error?: string;
  errorType?: string;
  errorSolution?: string;
  format: string;
  completedAt?: Date;
  createdAt?: Date;
}

interface ConversionOptions {
  format: string;
  bitrate: string;
  sampleRate: string;
  channels: string;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tasks, setTasks] = useState<ConversionTask[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [options, setOptions] = useState<ConversionOptions>({
    format: 'mp3',
    bitrate: '192k',
    sampleRate: '44100',
    channels: '2'
  });
  const [isUploading, setIsUploading] = useState(false);
  const [bilibiliUrl, setBilibiliUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // 初始化Socket.IO连接
  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('已连接到服务器');
    });

    newSocket.on('conversionStart', ({ taskId }) => {
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: 'converting' } : task
      ));
    });

    newSocket.on('conversionProgress', ({ taskId, progress }) => {
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, progress } : task
      ));
    });

    newSocket.on('conversionComplete', ({ taskId, outputFile }) => {
      setTasks(prev => prev.map(task => 
        task.id === taskId 
          ? { ...task, status: 'completed', progress: 100, outputFile, completedAt: new Date() } 
          : task
      ));
    });

    newSocket.on('conversionError', ({ taskId, error, errorType, errorSolution }) => {
      setTasks(prev => prev.map(task => 
        task.id === taskId 
          ? { ...task, status: 'error', error, errorType, errorSolution } 
          : task
      ));
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // 从 iframe 或 URL 中提取 Bilibili URL
  const extractBilibiliUrl = (input: string): string | null => {
    // 清理输入
    const cleaned = input.trim();
    
    // 如果是 iframe，提取 src 中的 URL
    const iframeMatch = cleaned.match(/src=["']([^"']*player\.bilibili\.com[^"']*)["']/);
    if (iframeMatch) {
      let url = iframeMatch[1];
      // 如果是相对路径，添加协议
      if (url.startsWith('//')) {
        url = 'https:' + url;
      }
      // 从 player URL 中提取 bvid 或 aid，构建标准视频 URL
      const bvidMatch = url.match(/[?&]bvid=([^&]+)/);
      const aidMatch = url.match(/[?&]aid=([^&]+)/);
      // 提取分集参数 p（重要：用于区分多集视频的不同分集）
      const pMatch = url.match(/[?&]p=(\d+)/);
      const pParam = pMatch ? `?p=${pMatch[1]}` : '';
      
      if (bvidMatch) {
        return `https://www.bilibili.com/video/${bvidMatch[1]}${pParam}`;
      } else if (aidMatch) {
        return `https://www.bilibili.com/video/av${aidMatch[1]}${pParam}`;
      }
      // 如果无法提取，返回原始 URL（yt-dlp 可能能处理）
      return url;
    }
    
    // 如果是直接的 URL
    if (cleaned.includes('bilibili.com') || cleaned.includes('player.bilibili.com')) {
      // 提取完整的 URL
      const urlMatch = cleaned.match(/(https?:\/\/[^\s<>"']*bilibili\.com[^\s<>"']*)/);
      if (urlMatch) {
        return urlMatch[1];
      }
      // 如果是相对路径，添加协议
      if (cleaned.startsWith('//')) {
        return 'https:' + cleaned;
      }
      // 尝试提取 bvid 或 aid，同时保留分集参数 p
      const bvidMatch = cleaned.match(/BV[a-zA-Z0-9]+/);
      const aidMatch = cleaned.match(/[?&]aid=(\d+)/);
      const pMatch = cleaned.match(/[?&]p=(\d+)/);
      const pParam = pMatch ? `?p=${pMatch[1]}` : '';
      
      if (bvidMatch) {
        return `https://www.bilibili.com/video/${bvidMatch[0]}${pParam}`;
      } else if (aidMatch) {
        return `https://www.bilibili.com/video/av${aidMatch[1]}${pParam}`;
      }
      return cleaned;
    }
    
    return null;
  };

  // 处理 Bilibili URL 转换
  const handleBilibiliUrl = useCallback(async () => {
    if (!bilibiliUrl.trim() || !socket) return;

    const extractedUrl = extractBilibiliUrl(bilibiliUrl.trim());
    if (!extractedUrl) {
      alert('请输入有效的 Bilibili 视频 URL 或 iframe 代码');
      return;
    }

    setIsDownloading(true);
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 添加任务到列表
    const newTask: ConversionTask = {
      id: taskId,
      originalName: `Bilibili视频 - ${extractedUrl}`,
      status: 'pending',
      progress: 0,
      format: options.format,
      createdAt: new Date()
    };
    setTasks(prev => [...prev, newTask]);

    try {
      const response = await fetch(`${API_URL}/api/convert-bilibili`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: extractedUrl,
          format: options.format,
          bitrate: options.bitrate,
          sampleRate: options.sampleRate,
          channels: options.channels,
          socketId: socket.id || ''
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '转换失败');
      }

      // 更新taskId为服务器返回的ID
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, id: result.taskId } : task
      ));

      // 清空输入框
      setBilibiliUrl('');

    } catch (error) {
      setTasks(prev => prev.map(task => 
        task.id === taskId 
          ? { ...task, status: 'error', error: (error as Error).message } 
          : task
      ));
    } finally {
      setIsDownloading(false);
    }
  }, [bilibiliUrl, socket, options]);

  // 处理文件上传
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !socket) return;

    setIsUploading(true);

    for (const file of Array.from(files)) {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 添加任务到列表
      const newTask: ConversionTask = {
        id: taskId,
        originalName: file.name,
        status: 'pending',
        progress: 0,
        format: options.format,
        createdAt: new Date()
      };
      setTasks(prev => [...prev, newTask]);

      try {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('format', options.format);
        formData.append('bitrate', options.bitrate);
        formData.append('sampleRate', options.sampleRate);
        formData.append('channels', options.channels);
        formData.append('socketId', socket.id || '');

        const response = await fetch(`${API_URL}/api/convert`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || '转换失败');
        }

        // 更新taskId为服务器返回的ID
        setTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, id: result.taskId } : task
        ));

      } catch (error) {
        setTasks(prev => prev.map(task => 
          task.id === taskId 
            ? { ...task, status: 'error', error: (error as Error).message } 
            : task
        ));
      }
    }

    setIsUploading(false);
  }, [socket, options]);

  // 拖拽处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  // 下载文件 - 在新标签页打开
  const handleDownload = (outputFile: string, originalName: string) => {
    const downloadUrl = `${API_URL}/output/${outputFile}`;
    // 在新标签页打开下载链接
    window.open(downloadUrl, '_blank');
  };

  // 删除任务
  const handleDeleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  };

  // 清除已完成的任务
  const clearCompletedTasks = () => {
    setTasks(prev => prev.filter(task => task.status !== 'completed' && task.status !== 'error'));
  };

  const getStatusIcon = (status: ConversionTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'converting':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Loader2 className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: ConversionTask['status']) => {
    switch (status) {
      case 'pending':
        return '等待中';
      case 'converting':
        return '转换中';
      case 'completed':
        return '已完成';
      case 'error':
        return '失败';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <FileAudio className="h-10 w-10 text-blue-600" />
            <h1 className="text-4xl font-bold text-slate-900">视频转音频工具</h1>
          </div>
          <p className="text-slate-600">支持多种视频格式，快速转换为高质量音频文件</p>
        </div>

        <Tabs defaultValue="convert" className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="convert">转换</TabsTrigger>
            <TabsTrigger value="settings">设置</TabsTrigger>
          </TabsList>

          <TabsContent value="convert" className="space-y-6">
            {/* Bilibili URL 输入区域 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="h-5 w-5" />
                  从 Bilibili 视频提取音频
                </CardTitle>
                <CardDescription>支持输入 Bilibili 视频 URL 或 iframe 代码</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bilibili-url">Bilibili 视频链接或 iframe</Label>
                  <textarea
                    id="bilibili-url"
                    value={bilibiliUrl}
                    onChange={(e) => setBilibiliUrl(e.target.value)}
                    placeholder="粘贴 Bilibili 视频 URL 或 iframe 代码，例如：&#10;https://www.bilibili.com/video/BV17uxSzDEEo&#10;或&#10;&lt;iframe src=&quot;//player.bilibili.com/player.html?aid=115330022181628&amp;bvid=BV17uxSzDEEo&quot;&gt;&lt;/iframe&gt;"
                    className="w-full min-h-[100px] px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                    disabled={isDownloading}
                  />
                </div>
                <Button
                  onClick={handleBilibiliUrl}
                  disabled={!bilibiliUrl.trim() || isDownloading || !socket}
                  className="w-full"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      下载中...
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4 mr-2" />
                      开始提取音频
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* 上传区域 */}
            <Card>
              <CardHeader>
                <CardTitle>上传视频文件</CardTitle>
                <CardDescription>支持 MP4, AVI, MOV, MKV, FLV, WMV, WEBM 等格式</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`
                    border-2 border-dashed rounded-lg p-12 text-center transition-all
                    ${isDragging 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-slate-300 hover:border-slate-400 bg-white'
                    }
                  `}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Upload className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-slate-700 mb-2">
                    拖拽视频文件到这里
                  </p>
                  <p className="text-sm text-slate-500 mb-4">或者</p>
                  <Button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.multiple = true;
                      input.accept = 'video/*';
                      input.onchange = (e) => {
                        const target = e.target as HTMLInputElement;
                        handleFileUpload(target.files);
                      };
                      input.click();
                    }}
                    disabled={isUploading}
                  >
                    {isUploading ? '上传中...' : '选择文件'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 转换任务列表 */}
            {tasks.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>转换任务</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearCompletedTasks}
                    >
                      清除已完成
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[...tasks].sort((a, b) => {
                    // 按完成时间倒序排列（最新完成的最前面）
                    // 如果已完成，按 completedAt 排序
                    // 如果未完成，按 createdAt 排序
                    const aTime = a.status === 'completed' ? a.completedAt : a.createdAt;
                    const bTime = b.status === 'completed' ? b.completedAt : b.createdAt;
                    
                    if (aTime && bTime) {
                      return bTime.getTime() - aTime.getTime();
                    }
                    if (aTime) return -1;
                    if (bTime) return 1;
                    return 0;
                  }).map((task) => (
                    <div
                      key={task.id}
                      className="p-4 border rounded-lg bg-white space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {getStatusIcon(task.status)}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {task.originalName}
                            </p>
                            <p className="text-sm text-slate-500">
                              {getStatusText(task.status)} · 格式: {task.format.toUpperCase()}
                              {task.status === 'completed' && task.completedAt && (
                                <span className="ml-2">
                                  · {new Date(task.completedAt).toLocaleString('zh-CN', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </span>
                              )}
                            </p>
                            {task.error && (
                              <Alert 
                                variant="destructive" 
                                className="mt-2"
                              >
                                <AlertDescription>
                                  {task.errorType === 'no_audio_stream' ? (
                                    <div className="space-y-2">
                                      <div className="font-semibold text-base mb-2">
                                        ❌ 错误：文件没有音频流
                                      </div>
                                      <div className="text-sm space-y-1">
                                        <p className="font-medium">问题说明：</p>
                                        <p>该视频文件只包含视频轨道，没有音频轨道，无法转换为音频文件。</p>
                                        <p className="font-medium mt-2">解决方案：</p>
                                        <ul className="list-disc list-inside ml-2 space-y-1">
                                          <li>请使用包含音频的视频文件进行转换</li>
                                          <li>可以在终端运行 <code className="bg-slate-800 text-white px-1 rounded">./check-audio-stream.sh</code> 检查文件是否有音频流</li>
                                          <li>如果文件确实没有音频，无法进行转换</li>
                                        </ul>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="font-semibold">转换失败</div>
                                      <div className="text-sm whitespace-pre-wrap">{task.error}</div>
                                      {task.errorSolution && (
                                        <div className="text-sm mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                                          <div className="font-medium text-blue-900 dark:text-blue-100">💡 建议：</div>
                                          <div className="text-blue-800 dark:text-blue-200">{task.errorSolution}</div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.status === 'completed' && task.outputFile && (
                            <Button
                              size="sm"
                              onClick={() => handleDownload(task.outputFile!, task.originalName)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              下载
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTask(task.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {task.status === 'converting' && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">进度</span>
                            <span className="font-medium text-slate-900">{task.progress}%</span>
                          </div>
                          <Progress value={task.progress} className="h-2" />
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  转换设置
                </CardTitle>
                <CardDescription>配置音频输出参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="format">输出格式</Label>
                  <Select
                    value={options.format}
                    onValueChange={(value) => setOptions(prev => ({ ...prev, format: value }))}
                  >
                    <SelectTrigger id="format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mp3">MP3</SelectItem>
                      <SelectItem value="aac">AAC</SelectItem>
                      <SelectItem value="wav">WAV</SelectItem>
                      <SelectItem value="ogg">OGG</SelectItem>
                      <SelectItem value="flac">FLAC</SelectItem>
                      <SelectItem value="m4a">M4A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bitrate">比特率</Label>
                  <Select
                    value={options.bitrate}
                    onValueChange={(value) => setOptions(prev => ({ ...prev, bitrate: value }))}
                  >
                    <SelectTrigger id="bitrate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="128k">128 kbps (标准)</SelectItem>
                      <SelectItem value="192k">192 kbps (高质量)</SelectItem>
                      <SelectItem value="256k">256 kbps (极高质量)</SelectItem>
                      <SelectItem value="320k">320 kbps (最高质量)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sampleRate">采样率</Label>
                  <Select
                    value={options.sampleRate}
                    onValueChange={(value) => setOptions(prev => ({ ...prev, sampleRate: value }))}
                  >
                    <SelectTrigger id="sampleRate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="22050">22050 Hz</SelectItem>
                      <SelectItem value="44100">44100 Hz (CD质量)</SelectItem>
                      <SelectItem value="48000">48000 Hz (专业)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="channels">声道</Label>
                  <Select
                    value={options.channels}
                    onValueChange={(value) => setOptions(prev => ({ ...prev, channels: value }))}
                  >
                    <SelectTrigger id="channels">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">单声道</SelectItem>
                      <SelectItem value="2">立体声</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 页脚 */}
        <div className="text-center text-sm text-slate-500">
          <p>由 MiniMax Agent 开发 · 所有转换在本地完成，保护您的隐私</p>
        </div>
      </div>
    </div>
  );
}

export default App;
