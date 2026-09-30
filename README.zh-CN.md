<p align="center">
  <img src="apps/desktop/resources/banner.png" alt="ArduDeck" />
</p>

<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp; <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/GPL-3.0"><img src="https://img.shields.io/badge/License-GPL%203.0-blue.svg" alt="License: GPL-3.0" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript" alt="TypeScript" /></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-28-47848F?logo=electron" alt="Electron" /></a>
  <a href="https://reactjs.org/"><img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React" /></a>
  <a href="https://mavlink.io/"><img src="https://img.shields.io/badge/MAVLink-v1%2Fv2-green" alt="MAVLink" /></a>
  <a href="https://github.com/iNavFlight/inav/wiki/MSP-V2"><img src="https://img.shields.io/badge/MSP-v1%2Fv2-orange" alt="MSP" /></a>
  <a href="https://codecov.io/gh/rubenCodeforges/ardudeck"><img src="https://codecov.io/gh/rubenCodeforges/ardudeck/branch/master/graph/badge.svg" alt="Coverage" /></a>
  <a href="https://discord.gg/JX2JdVXPPC"><img src="https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="https://forum.ardudeck.com"><img src="https://img.shields.io/badge/Forum-forum.ardudeck.com-f59e0b" alt="Forum" /></a>
  <a href="https://ardudeck.com"><img src="https://img.shields.io/badge/Website-ardudeck.com-22d3ee" alt="Website" /></a>
</p>

<p align="center">
  <a href="https://ardudeck.com">网站</a> &nbsp;·&nbsp;
  <a href="https://ardudeck.com/docs/">文档</a> &nbsp;·&nbsp;
  <a href="https://ardudeck.com/blog/">指南与截图</a> &nbsp;·&nbsp;
  <a href="https://forum.ardudeck.com">社区论坛</a> &nbsp;·&nbsp;
  <a href="https://discord.gg/JX2JdVXPPC">Discord</a>
</p>

<p align="center">
  <strong>面向 ArduPilot、Betaflight 和 iNav 的现代化跨平台地面站。</strong>
</p>

<p align="center">
  <sub>支持方</sub><br />
  <a href="https://adlerblix.de" target="_blank" rel="noopener noreferrer"><img src="docs/sponsors/adlerblix.svg" alt="Adlerblix - optical aerial surveying" height="40" /></a>
</p>

ArduDeck 是一个使用 Electron、React 和 TypeScript 构建的开源地面站（Ground Control Station）。一个应用覆盖完整工作流程：连接、配置、校准、规划、飞行和分析，面向运行 ArduPilot（MAVLink）或 Betaflight/iNav（MSP）的载具（vehicle），从通过 USB 连接的单台四轴到通过无线电、IP 或蜂窝链路组成的载具集群。

> **Beta 1 (0.1.0)** - ArduDeck 处于 beta 阶段。它已用于真实飞行作业，但请预期存在粗糙之处，并保留一个备用配置工具。在[社区论坛](https://forum.ardudeck.com)或 [Discord](https://discord.gg/JX2JdVXPPC) 上提问并分享配置，阅读[文档](https://ardudeck.com/docs/)，或使用内置的[缺陷报告](#缺陷报告)来帮助改进项目。

---

## 目录

- [截图](#截图)
- [功能特性](#功能特性)
- [下载与安装](#下载与安装)
- [支持的载具与固件](#支持的载具与固件)
- [从源码构建](#从源码构建)
- [缺陷报告](#缺陷报告)
- [贡献](#贡献)
- [赞助商](#赞助商)
- [许可证](#许可证)
- [致谢](#致谢)

---

## 截图

<p align="center">
  <a href="docs/screenshots/_new/mission_planning_overview.png?raw=true">
    <img src="docs/screenshots/_new/mission_planning_overview.png" alt="Mission and survey planning" width="800"/>
  </a>
  <br/>
  <em>任务规划，包含分组的航点、感知地形的高度剖面，以及实时飞行信息估算</em>
</p>

<p align="center">
  <a href="docs/screenshots/_new/osd_simulator_demo.png?raw=true">
    <img src="docs/screenshots/_new/osd_simulator_demo.png" alt="OSD Tool" width="800"/>
  </a>
  <br/>
  <em>OSD 工具：可组合的地面渲染 HUD、飞控文本 OSD 编辑器，以及 RubyFPV 布局编写</em>
</p>

<p align="center">
  <a href="docs/screenshots/_new/lua_loaded_template.png?raw=true">
    <img src="docs/screenshots/_new/lua_loaded_template.png" alt="Lua Graph Editor" width="800"/>
  </a>
  <br/>
  <em>Lua 图形编辑器：以可视化方式构建 ArduPilot Lua 脚本，支持实时代码预览与导出</em>
</p>

更多截图、指南和完整文档见网站：[ardudeck.com/docs](https://ardudeck.com/docs/)。有疑问或想分享你的作品？加入[社区论坛](https://forum.ardudeck.com)。

---

## 功能特性

### 飞行操作
- **可停靠的遥测仪表板** - 以 IDE 风格面板显示姿态、高度、速度、GPS、电池、飞行模式和消息，布局可保存
- **交互式地图** - 载具实时跟踪、飞行轨迹、多种底图图层、离线地图下载
- **地图叠加层** - 气象雷达、动态风场、空域区、OpenAIP 航空图、地形高程，以及实时空中交通（ADS-B / OGN）
- **视频与相机** - 相机面板支持可插拔信号源（WebRTC、RTSP/ffmpeg、UVC）、云台控制，以及 wfb-ng / RunCam WiFiLink 链路的引导式设置
- **飞行指令**放在它该在的地方：解锁/上锁、起飞、模式切换，以及从遥测界面发起的引导式「飞到这里」

### 多载具
- **一键引擎** - 单击即可启动本地协同引擎；ArduDeck 会自动连接到它
- **简单的载具接入** - 通过无线电、互联网、蜂窝网络（基于 IP 的 4G/5G 调制解调器）或第二个地面站「添加载具」
- **集群作业** - 按载具的遥测与指令下发、可一眼查看健康状况的集群状态条、颜色编码的地图标记、编队控制，以及分组操作
- **集群测绘拆分** - 将测绘区域分配给多台载具
- **集群日志获取** - 通过引擎从每台载具下载日志，以便并排分析

### RTK GPS 差分校正（NTRIP）
- **内置 NTRIP 客户端** - 连接到任意 NTRIP caster，浏览 sourcetable，并将 RTCM 差分数据流式发送到载具
- **NTRIP v1 与 v2** - 规范的 v2 实现（HTTP/1.1、分块传输），并可自动回退到经典 v1 caster
- **GGA 位置上报**回传给 caster，用于网络（VRS）挂载点
- **直连或全集群** - 差分数据通过单一连接传输，或经由多载具引擎发送到每台载具

### 任务规划
- **交互式编辑** - 单击添加航点、拖动重新定位、撤销/重做、持续自动保存并支持崩溃恢复
- **任务分组** - 航点组织为带名称和颜色的分组（手动或测绘），支持分组统计、显示/隐藏，以及按组上传或保存
- **高度参考系感知剖面** - 地形剖面能理解每个航点的 relative、AMSL 和 terrain MAVLink 参考系，并支持拖动编辑高度
- **地形碰撞检测** - 当路径与地形相交时给出可视化警告，并提供一键自动调整
- **样条航点、3D 视图、任务库** - 曲线路径、三维可视化，以及本地任务库和 .waypoints（QGC WPL）与 .plan 导入/导出
- **完整的 MAVLink 任务协议** - 上传、下载、地理围栏（geofence）和集结点（rally points）

### 测绘规划
- **航线模式** - 网格、交叉网格（可选两种高度）、圆形、螺旋、周边填充，以及沿中心线的走廊测绘，支持固定翼或旋翼转弯策略
- **GSD 优先规划** - 按地面采样距离（GSD）规划，支持相机预设，并实时估算照片、电量与数据量
- **地形跟随** - 基于 DEM 的连续地形跟随，使相机保持离地高度，无需机载地形数据库
- **多多边形区域** - 多个测绘多边形并支持禁飞孔洞，另有专门的区域编辑器窗口用于边界编辑
- **按电池续航拆分架次** - 将长测绘任务拆分为与电池续航匹配的飞行架次，每个架次可独立上传
- **GIS 导入** - KML、KMZ、GeoJSON 和 Shapefile 边界

### 飞行日志分析
- **日志浏览器** - 对 ArduPilot DataFlash 日志进行多图表绘制，支持独立 y 轴、缩放/平移、区间最小值/平均值/最大值统计，以及图表、地图和 3D 飞行路径之间的同步游标
- **FFT 频谱** - 用于振动与滤波器工作的频率分析
- **事件与参数** - 飞行事件时间线以及日志中记录的参数集
- **健康报告** - 针对振动、GPS、EKF、电源、失效保护等的自动通过/警告/失败检查
- **AI 辅助分析** - 与 Claude、GPT 或 Gemini 讨论日志；Claude 分析器可以查询原始遥测数据，并提出可应用的参数修改建议

### OSD 工具
- **文本 OSD 编辑器** - 读取、编辑并上传飞控 OSD：支持多屏幕的 ArduPilot OSDn 参数，以及 MSP/Betaflight OSD 布局
- **可组合的自定义 HUD** - 在地面渲染的 HUD 上自由放置遥测读数（由 ArduDeck 绘制，绝不上传到飞控）
- **RubyFPV 布局编写** - 配置 RubyFPV 地面端 OSD 屏幕并导出供地面站使用
- **实时视频背景** - 在实际视频画面上预览每种 OSD 变体，支持 MCM 字体并内置字体

### 载具设置与调参
- **参数管理** - 带元数据的完整参数列表、搜索、范围/枚举/增量校验、修改跟踪，以及 .param 文件导入/导出
- **PID 调参** - ArduPilot 与 Betaflight/iNav 调参，支持预设、角速率曲线编辑器，以及 QuadPlane 上的 VTOL / 固定翼控制器切换
- **飞行模式、安全与失效保护** - 模式通道分配、失效保护动作、地理围栏行为，以及 MAVLink 签名
- **校准** - 加速度计、罗盘（包括 CompassMot 电机干扰校准和大型载具磁罗盘校准），并提供分步向导
- **电机测试、舵机向导、快速设置** - 针对机架、固定翼和首次配置的引导式流程
- **CLI 终端** - 基于 xterm 的终端，支持自动补全和历史记录，包括为通过 CLI 驱动的旧款 F3 时代飞控板提供完整 GUI 配置

### 固件与连接
- **固件刷写** - ArduPilot、Betaflight 和 iNav，支持飞控板自动检测（MAVLink、MSP、STM32 bootloader）、USB VID/PID 识别，以及 boot 焊盘向导
- **连接** - 串口（USB）、TCP 和 UDP，支持端口扫描和 MAVLink v1/v2 自动检测
- **链路诊断（Link Doctor）** - 连接诊断，识别链路上实际存在的设备以及它为何没有通信
- **MAVLink 检查器** - 带字段图表的实时消息浏览器
- **稳健的遥测链路** - 针对低速 SiK 类无线电链路优化的参数下载恢复

### 仿真
- **内置 SITL** - 在电脑上下载并运行真实的 ArduPilot 固件（Copter、Plane、Rover、Sub），选择机架和发行分支，ArduDeck 会自动连接
- **虚拟遥控与 FlightGear 桥接** - 从应用内操控仿真载具，可选在 FlightGear 中可视化
- **集群 SITL** - 启动多个 SITL 载具，无需硬件即可演练多载具功能

### 脚本与伴飞硬件
- **Lua 图形编辑器** - 通过连接节点（传感器、逻辑、数学、动作）构建 ArduPilot Lua 脚本，支持实时代码预览、模板和一键导出（[文档](apps/desktop/src/renderer/components/lua-graph/docs/)）
- **伴飞板卡** - ESP32 刷写与预配置模板（DroneBridge、MAVLink 桥接）、DroneBridge 自动发现，以及面向 Raspberry Pi 级伴飞计算机的 agent 仪表板（指标、终端、服务）

### 使用体验
- **单位偏好** - 按量分别选择公制或英制（距离、高度、速度、风速、重量、面积、容量）
- **功能导览** - 对新增和现有界面的简短引导式讲解
- **载具配置文件** - 按载具的配置，包含类型专属属性以及起飞点的实时天气
- **内置缺陷报告** - 一个界面即可将脱敏日志收集到加密报告中，由你决定是否分享

---

## 下载与安装

大多数用户应下载预构建的发行版。无需克隆或构建任何内容。

| 平台 | 格式 |
|----------|--------|
| **Windows** | 安装程序（.exe）和便携版（.exe） |
| **macOS** | DMG（Apple Silicon） |
| **Linux** | AppImage 和 .deb |

所有下载：[最新发行版](https://github.com/rubenCodeforges/ardudeck/releases/latest)

安装后，通过 USB 插入飞控（或让 ArduDeck 指向你的遥测链路），即可开始使用。

> **Linux AppImage 说明：** 在 Ubuntu 24.04+ 及其他较新的发行版上，AppImage 需要 `libfuse2`（`sudo apt install libfuse2`），或以 `APPIMAGE_EXTRACT_AND_RUN=1` 运行。`.deb` 包没有此依赖。
>
> **代码签名：** ArduDeck 的二进制文件目前未签名。在 macOS 上，右键点击应用并选择「打开」（或运行 `xattr -cr /Applications/ArduDeck.app`）。在 Windows SmartScreen 中，点击「更多信息」，然后点击「仍要运行」。
>
> **自动更新：** Windows 和 Linux 可在应用内一键更新。在 macOS 上，ArduDeck 会通知新版本并打开发行页面以便手动下载，直到应用完成代码签名。

---

## 支持的载具与固件

### ArduPilot (MAVLink)
- **Copter** - 四轴、六轴、八轴多旋翼
- **Plane** - 固定翼飞机、飞翼
- **VTOL** - 倾转旋翼、尾座式、QuadPlane
- **Rover** - 地面载具、船
- **Submarine** - 水下 ROV（ArduSub）

### Betaflight & iNav (MSP)
- 通过现代 MSP 在 F4/F7/H7 飞控板上使用**多旋翼与固定翼**
- **旧款 F3 时代飞控板**（SPRacing F3、Naze32、Flip32 等）获得相同的图形界面，底层通过 CLI 驱动：PID、rates、混控、舵机和模式选项卡均可使用，并可为 iNav 2.0.0 / Betaflight 3.5.7 时代的构建刷写固件

---

## 从源码构建

仅当你想要修改 ArduDeck 或参与贡献时才需要。其他用户应[下载发行版](#下载与安装)。

### 前置要求

- **Node.js** 20 或更高版本
- **pnpm** 9 或更高版本

### 环境搭建

```bash
# Fork the repo on GitHub first, then clone your fork
git clone https://github.com/<your-username>/ardudeck.git
cd ardudeck

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev
```

### 打包生产版本

```bash
pnpm package
```

该仓库是一个 pnpm workspace：Electron 应用位于 `apps/desktop`，协议与解析库位于 `packages/`（MAVLink、MSP、DataFlash 日志解析、STM32 刷写等）。

---

## 缺陷报告

ArduDeck 内置缺陷报告工具（侧边栏中的 bug 图标）。它会收集最近的应用日志（路径已脱敏）、系统信息，以及可选的飞控板配置转储，明确显示将包含哪些内容，并生成一个只有 ArduDeck 团队能读取的加密 `.deckreport` 文件。你可以将其附加到 [GitHub issue](https://github.com/rubenCodeforges/ardudeck/issues)，或在 [Discord](https://discord.gg/JX2JdVXPPC) 上分享。不会自动上传任何内容；由你决定何时以及如何分享。

---

## 贡献

欢迎贡献。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)（其中涵盖 CLA 和工作流程），然后：

1. Fork 仓库并克隆你的 fork
2. 从 `master` 创建功能分支
3. 进行修改，并在合适的地方添加测试
4. 提交 Pull Request

---

## 赞助商

ArduDeck 由为其贡献硬件、时间或资源的公司提供支持。

- [Adlerblix](https://adlerblix.de) - 光学航空测绘：摄影测量、RTK 精度、大面积制图（德国）

---

## 许可证

本项目采用 **GPL-3.0** 许可，详见 [LICENSE](LICENSE) 文件。

---

## 致谢

- [ArduPilot](https://ardupilot.org/) - 开源自动驾驶仪固件
- [Betaflight](https://betaflight.com/) - 面向多旋翼的飞控固件
- [iNav](https://github.com/iNavFlight/inav) - 侧重导航的飞控固件
- [Mission Planner](https://github.com/ArduPilot/MissionPlanner) 和 [QGroundControl](http://qgroundcontrol.com/) - 铺平道路的地面站
- [MAVLink](https://mavlink.io/) - 微型飞行器通信协议
- [Leaflet](https://leafletjs.com/) - 交互式地图库

---

<p align="center">
  由 <a href="https://github.com/rubenCodeforges">Codeforges</a> 制作
</p>
