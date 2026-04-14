# 地图测距 API

## 接口地址

`POST /api/map-distance`

## 用途

用于系统间调用，输入起点和终点地址，返回解析后的地址信息、路线距离、路线耗时和直线距离。

## 鉴权方式

请求头中传入：

```http
x-api-key: 你的 MAP_DISTANCE_API_KEY
Content-Type: application/json
```

## 环境变量

```env
MAP_DISTANCE_API_KEY=your_map_distance_api_key
AMAP_WEB_SERVICE_KEY=your_amap_web_service_key
```

说明：

- `MAP_DISTANCE_API_KEY` 用于调用你自己的接口鉴权
- `AMAP_WEB_SERVICE_KEY` 用于服务端请求高德 Web Service
- 如果代码中保留了 fallback，也可以回退到 `NEXT_PUBLIC_AMAP_KEY`，但更建议单独配置 `AMAP_WEB_SERVICE_KEY`

## 请求参数

### Body

```json
{
  "start": "楚风商务大厦45号楼",
  "end": "阳光富景花园5号楼",
  "mode": "bicycling"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `start` | `string` | 是 | 起点地址，支持中文地址或 `lng,lat` |
| `end` | `string` | 是 | 终点地址，支持中文地址或 `lng,lat` |
| `mode` | `string` | 否 | 路线模式：`bicycling`、`driving`、`walking`，默认 `bicycling` |

## 返回示例

```json
{
  "start": {
    "input": "楚风商务大厦45号楼",
    "resolved": "重庆市渝北区楚风商务大厦45号楼",
    "location": {
      "lng": 106.5516,
      "lat": 29.563
    }
  },
  "end": {
    "input": "阳光富景花园5号楼",
    "resolved": "重庆市渝北区阳光富景花园5号楼",
    "location": {
      "lng": 106.5621,
      "lat": 29.5712
    }
  },
  "route": {
    "mode": "bicycling",
    "distance": 5230,
    "distanceText": "5.23km",
    "duration": 1080,
    "durationText": "18分钟"
  },
  "lineDistance": {
    "distance": 4120,
    "distanceText": "4.12km"
  }
}
```

## 返回字段说明

| 字段 | 说明 |
| --- | --- |
| `start.input` | 原始起点输入 |
| `start.resolved` | 高德解析后的起点地址 |
| `start.location` | 起点经纬度 |
| `end.input` | 原始终点输入 |
| `end.resolved` | 高德解析后的终点地址 |
| `end.location` | 终点经纬度 |
| `route.mode` | 实际使用的路线模式 |
| `route.distance` | 路线距离，单位米 |
| `route.distanceText` | 格式化后的路线距离 |
| `route.duration` | 路线耗时，单位秒 |
| `route.durationText` | 格式化后的路线耗时 |
| `lineDistance.distance` | 起终点直线距离，单位米 |
| `lineDistance.distanceText` | 格式化后的直线距离 |

## 错误响应

### 鉴权失败

```json
{
  "error": "Unauthorized"
}
```

### 缺少参数

```json
{
  "error": "start and end are required"
}
```

### 高德 Key 未配置

```json
{
  "error": "AMAP_WEB_SERVICE_KEY is not configured"
}
```

### 地址解析或路线失败

```json
{
  "error": "具体错误信息"
}
```

## 调用示例

### PowerShell

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3010/api/map-distance" -Headers @{"x-api-key"="ssqnb666";"Content-Type"="application/json"} -Body '{"start":"楚风商务大厦45号楼","end":"阳光富景花园5号楼","mode":"bicycling"}'
```

### curl

```bash
curl.exe -X POST "http://localhost:3010/api/map-distance" \
  -H "x-api-key: ssqnb666" \
  -H "Content-Type: application/json" \
  --data-raw "{\"start\":\"楚风商务大厦45号楼\",\"end\":\"阳光富景花园5号楼\",\"mode\":\"bicycling\"}"
```

### Node.js

```js
const res = await fetch("http://localhost:3010/api/map-distance", {
  method: "POST",
  headers: {
    "x-api-key": "ssqnb666",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    start: "楚风商务大厦45号楼",
    end: "阳光富景花园5号楼",
    mode: "bicycling",
  }),
});

const data = await res.json();
console.log(data);
```
