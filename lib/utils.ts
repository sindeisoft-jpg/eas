import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 常见数据库字段名的中英文映射表
 */
const COLUMN_NAME_TRANSLATIONS: Record<string, string> = {
  // ID 相关
  'id': 'ID',
  'customer_id': '客户ID',
  'user_id': '用户ID',
  'order_id': '订单ID',
  'product_id': '产品ID',
  'item_id': '项目ID',
  'account_id': '账户ID',
  'employee_id': '员工ID',
  'supplier_id': '供应商ID',
  
  // 名称相关
  'name': '名称',
  'customer_name': '客户名称',
  'user_name': '用户名',
  'product_name': '产品名称',
  'company_name': '公司名称',
  'full_name': '全名',
  'first_name': '名',
  'last_name': '姓',
  
  // 时间相关
  'date': '日期',
  'time': '时间',
  'created_at': '创建时间',
  'updated_at': '更新时间',
  'deleted_at': '删除时间',
  'start_date': '开始日期',
  'end_date': '结束日期',
  'birth_date': '出生日期',
  'order_date': '订单日期',
  'created_time': '创建时间',
  'updated_time': '更新时间',
  
  // 状态相关
  'status': '状态',
  'type': '类型',
  'category': '类别',
  'level': '级别',
  'priority': '优先级',
  
  // 数量相关
  'count': '数量',
  'quantity': '数量',
  'amount': '金额',
  'price': '价格',
  'total': '总计',
  'sum': '合计',
  'avg': '平均值',
  'max': '最大值',
  'min': '最小值',
  
  // 地址相关
  'address': '地址',
  'email': '邮箱',
  'phone': '电话',
  'mobile': '手机',
  'city': '城市',
  'province': '省份',
  'country': '国家',
  'zip': '邮编',
  'postal_code': '邮政编码',
  
  // 其他常见字段
  'description': '描述',
  'remark': '备注',
  'note': '备注',
  'comment': '评论',
  'title': '标题',
  'content': '内容',
  'code': '代码',
  'number': '编号',
  'value': '值',
  'unit': '单位',
  'rate': '比率',
  'percent': '百分比',
  'ratio': '比例',
  
  // 业务相关字段
  'industry': '行业',
  'source': '来源',
  'assigned_to': '负责人',
  'customer_type': '客户类型',
  'created_by': '创建人',
  'updated_by': '更新人',
  'company': '公司',
  'tags': '标签',
  'notes': '备注',
}

/**
 * 单词级别的翻译映射
 */
const WORD_TRANSLATIONS: Record<string, string> = {
  'customer': '客户',
  'user': '用户',
  'order': '订单',
  'product': '产品',
  'item': '项目',
  'account': '账户',
  'employee': '员工',
  'supplier': '供应商',
  'company': '公司',
  'created': '创建',
  'updated': '更新',
  'deleted': '删除',
  'start': '开始',
  'end': '结束',
  'birth': '出生',
  'date': '日期',
  'time': '时间',
  'at': '于',
  'name': '名称',
  'first': '名',
  'last': '姓',
  'full': '全',
  'status': '状态',
  'type': '类型',
  'category': '类别',
  'level': '级别',
  'priority': '优先级',
  'count': '数量',
  'quantity': '数量',
  'amount': '金额',
  'price': '价格',
  'total': '总计',
  'sum': '合计',
  'avg': '平均',
  'average': '平均',
  'max': '最大',
  'maximum': '最大',
  'min': '最小',
  'minimum': '最小',
  'address': '地址',
  'email': '邮箱',
  'phone': '电话',
  'mobile': '手机',
  'city': '城市',
  'province': '省份',
  'country': '国家',
  'zip': '邮编',
  'postal': '邮政',
  'code': '代码',
  'description': '描述',
  'remark': '备注',
  'note': '备注',
  'comment': '评论',
  'title': '标题',
  'content': '内容',
  'number': '编号',
  'value': '值',
  'unit': '单位',
  'rate': '比率',
  'percent': '百分比',
  'ratio': '比例',
  'id': 'ID',
  'industry': '行业',
  'source': '来源',
  'assigned': '分配',
  'to': '到',
  'by': '由',
  'company': '公司',
  'tags': '标签',
}

/**
 * 判断字符串是否包含中文字符
 */
function containsChinese(str: string): boolean {
  return /[\u4e00-\u9fa5]/.test(str)
}

/**
 * 将英文表头翻译成中文
 * 例如: customer_id -> 客户ID, created_at -> 创建时间
 * 
 * @param columnName 原始列名
 * @returns 翻译后的列名
 */
export function translateColumnName(columnName: string): string {
  if (!columnName) return columnName
  
  // 如果已经包含中文，直接返回
  if (containsChinese(columnName)) {
    return columnName
  }
  
  // 先检查完整匹配
  const lowerName = columnName.toLowerCase()
  if (COLUMN_NAME_TRANSLATIONS[lowerName]) {
    return COLUMN_NAME_TRANSLATIONS[lowerName]
  }
  
  // 处理下划线分隔的格式 (如 customer_id, created_at)
  if (lowerName.includes('_')) {
    const parts = lowerName.split('_')
    const translatedParts = parts.map(part => {
      // 移除可能的数字后缀
      const cleanPart = part.replace(/\d+$/, '')
      return WORD_TRANSLATIONS[cleanPart] || part
    })
    
    // 如果所有部分都翻译成功，组合起来
    if (translatedParts.every((part, idx) => 
      part !== parts[idx] || WORD_TRANSLATIONS[part.toLowerCase()] !== undefined
    )) {
      return translatedParts.join('')
    }
  }
  
  // 处理驼峰命名 (如 customerId, createdAt)
  if (/[a-z][A-Z]/.test(columnName)) {
    const parts = columnName.split(/(?=[A-Z])/).map(p => p.toLowerCase())
    const translatedParts = parts.map(part => {
      const cleanPart = part.replace(/\d+$/, '')
      return WORD_TRANSLATIONS[cleanPart] || part
    })
    
    if (translatedParts.some(p => WORD_TRANSLATIONS[p.toLowerCase()])) {
      return translatedParts.join('')
    }
  }
  
  // 单个单词的情况
  const cleanWord = lowerName.replace(/\d+$/, '')
  if (WORD_TRANSLATIONS[cleanWord]) {
    return WORD_TRANSLATIONS[cleanWord]
  }
  
  // 如果无法翻译，返回原始值
  return columnName
}

/**
 * 从地址字符串中提取城市名称
 * 支持中英文地址格式
 * 
 * @param address 地址字符串
 * @returns 提取的城市名称，如果无法提取则返回 null
 */
export function extractCityFromAddress(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') {
    return null
  }

  const addr = address.trim()
  if (!addr) {
    return null
  }

  // 常见中国城市列表（用于匹配）
  const chineseCities = [
    '北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '武汉', '西安', '重庆',
    '天津', '苏州', '长沙', '郑州', '青岛', '大连', '宁波', '厦门', '无锡', '佛山',
    '东莞', '济南', '合肥', '福州', '石家庄', '哈尔滨', '长春', '沈阳', '南昌', '昆明',
    '贵阳', '海口', '南宁', '太原', '兰州', '银川', '西宁', '乌鲁木齐', '拉萨', '呼和浩特'
  ]

  // 常见中国省份/直辖市（用于排除）
  const provinces = [
    '北京', '上海', '天津', '重庆', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
    '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东',
    '广西', '海南', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
    '省', '市', '自治区', '特别行政区'
  ]

  // 模式1: 中文地址格式 - 通常格式为：省/市 市 区/县 街道...
  // 例如：北京市朝阳区xxx、广东省深圳市南山区xxx
  const chinesePatterns = [
    // 直辖市格式：北京市xxx、上海市xxx
    /^([^省市区县]+?[市])(?![市区县])/,
    // 省+市格式：广东省深圳市xxx、江苏省南京市xxx
    /(?:省|自治区|特别行政区)([^省市区县]+?[市])/,
    // 直接匹配城市名（在常见城市列表中）
    new RegExp(`(${chineseCities.join('|')})`, 'g'),
  ]

  for (const pattern of chinesePatterns) {
    const match = addr.match(pattern)
    if (match && match[1]) {
      const city = match[1].trim()
      // 排除省份名称
      if (!provinces.includes(city) && city.length >= 2 && city.length <= 6) {
        return city
      }
    }
  }

  // 模式2: 英文地址格式 - 通常格式为：Street, City, State/Province, Country
  // 例如：123 Main St, New York, NY, USA
  const englishPatterns = [
    // 匹配 "City, State" 格式
    /,\s*([A-Z][a-zA-Z\s]+?),\s*[A-Z]{2,}/,
    // 匹配 "City" 在逗号分隔的地址中
    /,\s*([A-Z][a-zA-Z\s]+?)(?:,\s*(?:State|Province|Country|[A-Z]{2}))/i,
  ]

  for (const pattern of englishPatterns) {
    const match = addr.match(pattern)
    if (match && match[1]) {
      const city = match[1].trim()
      // 排除常见的非城市词汇
      const excludeWords = ['Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Drive', 'Dr', 'Lane', 'Ln']
      if (!excludeWords.some(word => city.includes(word)) && city.length >= 2) {
        return city
      }
    }
  }

  // 模式3: 尝试从地址中提取看起来像城市的部分
  // 查找包含"市"的中文字符串
  const cityWithSuffix = addr.match(/([^省市区县]+?市)/)
  if (cityWithSuffix && cityWithSuffix[1]) {
    const city = cityWithSuffix[1].trim()
    if (!provinces.includes(city) && city.length >= 2 && city.length <= 6) {
      return city
    }
  }

  // 如果无法提取，返回 null
  return null
}

/**
 * 从查询结果中提取城市信息并统计
 * 
 * @param queryResult 查询结果对象
 * @param addressColumn 地址字段名（如果为null则自动检测）
 * @returns 城市统计结果，格式为 { columns: string[], rows: Array<{城市: string, 数量: number}> }
 */
export function extractAndAnalyzeCities(
  queryResult: any,
  addressColumn?: string | null
): { columns: string[], rows: Array<{ [key: string]: any }> } | null {
  if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
    return null
  }

  const { columns, rows } = queryResult

  // 自动检测地址字段
  let addrColumn = addressColumn
  if (!addrColumn) {
    // 查找包含"地址"、"address"的列
    addrColumn = columns.find((col: string) => 
      /地址|address/i.test(col)
    ) || null
  }

  if (!addrColumn) {
    return null
  }

  // 从每行数据中提取城市
  const cityCounts = new Map<string, number>()
  const extractedCities: Array<{ row: any, city: string | null }> = []

  for (const row of rows) {
    // 尝试多种可能的列名格式
    const address = row[addrColumn] || 
                   row[addrColumn.toLowerCase()] || 
                   row[addrColumn.toUpperCase()] ||
                   null

    if (address) {
      const city = extractCityFromAddress(address)
      extractedCities.push({ row, city })
      
      if (city) {
        cityCounts.set(city, (cityCounts.get(city) || 0) + 1)
      }
    }
  }

  // 如果没有提取到任何城市，返回 null
  if (cityCounts.size === 0) {
    return null
  }

  // 转换为统计结果格式
  const cityStats = Array.from(cityCounts.entries())
    .map(([city, count]) => ({
      '城市': city,
      '数量': count
    }))
    .sort((a, b) => b['数量'] - a['数量']) // 按数量降序排列

  return {
    columns: ['城市', '数量'],
    rows: cityStats
  }
}
