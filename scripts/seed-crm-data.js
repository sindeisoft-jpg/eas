/**
 * CRM数据库测试数据生成脚本
 * 生成大量真实的CRM测试数据用于系统测试
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 读取.env文件并解析数据库配置
function getDbConfig() {
  const envPath = path.join(process.cwd(), '.env');
  let dbUser = 'root';
  let dbPass = 'root';
  let dbHost = '127.0.0.1';
  let dbPort = '3306';

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const dbUrlMatch = envContent.match(/DATABASE_URL\s*=\s*"mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^"?\s]+)/);
    
    if (dbUrlMatch) {
      dbUser = dbUrlMatch[1];
      dbPass = dbUrlMatch[2];
      dbHost = dbUrlMatch[3];
      dbPort = dbUrlMatch[4];
    }
  }

  return {
    host: dbHost,
    port: parseInt(dbPort),
    user: dbUser,
    password: dbPass,
    database: 'crm',
    multipleStatements: true,
  };
}

const dbConfig = getDbConfig();

// 中文姓名库
const firstNames = [
  '张', '王', '李', '刘', '陈', '杨', '赵', '黄', '周', '吴',
  '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗',
  '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧',
  '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕',
  '苏', '卢', '蒋', '蔡', '贾', '丁', '魏', '薛', '叶', '阎'
];

const lastNames = [
  '伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军',
  '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀兰', '霞',
  '平', '刚', '桂英', '建华', '文', '华', '建国', '红', '志强', '桂兰',
  '桂芳', '凤英', '秀华', '秀荣', '秀梅', '秀云', '秀珍', '秀英', '秀兰', '秀芳',
  '建国', '建军', '建华', '建强', '建明', '建平', '建伟', '建勇', '建超', '建强'
];

// 公司名称库
const companyNames = [
  '科技有限公司', '贸易有限公司', '实业有限公司', '投资有限公司', '发展有限公司',
  '集团股份有限公司', '电子科技有限公司', '信息科技有限公司', '网络科技有限公司',
  '商贸有限公司', '制造有限公司', '工程有限公司', '建设有限公司', '房地产有限公司',
  '物流有限公司', '咨询有限公司', '管理有限公司', '服务有限公司', '传媒有限公司',
  '文化传播有限公司', '广告有限公司', '设计有限公司', '装饰有限公司', '餐饮有限公司'
];

const companyPrefixes = [
  '华', '中', '国', '东', '西', '南', '北', '新', '大', '小',
  '金', '银', '天', '地', '海', '山', '云', '星', '月', '日',
  '龙', '凤', '虎', '豹', '鹰', '鹏', '飞', '腾', '跃', '升',
  '智', '慧', '创', '新', '科', '技', '信', '息', '数', '码'
];

// 行业列表
const industries = [
  '信息技术', '金融服务', '制造业', '零售业', '房地产',
  '医疗健康', '教育培训', '餐饮服务', '物流运输', '能源',
  '建筑工程', '广告传媒', '旅游酒店', '电子商务', '咨询服务'
];

// 城市列表
const cities = [
  '北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '武汉',
  '西安', '重庆', '天津', '苏州', '长沙', '郑州', '济南', '青岛',
  '大连', '厦门', '福州', '合肥', '石家庄', '太原', '沈阳', '长春',
  '哈尔滨', '南昌', '南宁', '昆明', '贵阳', '海口', '兰州', '银川'
];

// 产品名称库
const productNames = [
  '企业管理系统', 'CRM客户管理', 'ERP系统', '财务软件', 'OA办公系统',
  '数据分析平台', '云存储服务', '网络安全产品', '移动应用开发', '网站建设',
  '营销自动化工具', '客户服务系统', '供应链管理', '人力资源系统', '项目管理工具',
  '商业智能BI', '大数据平台', '人工智能解决方案', '物联网设备', '区块链服务'
];

const productCategories = [
  '软件产品', '硬件设备', '云服务', '咨询服务', '技术支持',
  '培训服务', '定制开发', '系统集成', '运维服务', '数据分析'
];

// 线索来源
const leadSources = [
  '网站', '电话咨询', '邮件营销', '社交媒体', '展会',
  '合作伙伴推荐', '客户转介绍', '搜索引擎', '广告投放', '线下活动'
];

// 商机阶段
const opportunityStages = [
  'prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
];

// 订单状态
const orderStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

// 活动类型
const activityTypes = ['call', 'email', 'meeting', 'task', 'note'];

// 生成随机整数
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 生成随机浮点数
function randomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

// 生成随机日期
function randomDate(start, end) {
  const startTime = start.getTime();
  const endTime = end.getTime();
  const randomTime = startTime + Math.random() * (endTime - startTime);
  return new Date(randomTime);
}

// 生成随机中文姓名
function randomChineseName() {
  const firstName = firstNames[randomInt(0, firstNames.length - 1)];
  const lastName = lastNames[randomInt(0, lastNames.length - 1)];
  return firstName + lastName;
}

// 生成随机公司名
function randomCompanyName() {
  const prefix = companyPrefixes[randomInt(0, companyPrefixes.length - 1)];
  const suffix = companyNames[randomInt(0, companyNames.length - 1)];
  return prefix + suffix;
}

// 生成随机邮箱
function randomEmail(name, company) {
  const domains = ['gmail.com', 'qq.com', '163.com', 'sina.com', 'outlook.com', 'company.com'];
  const domain = company ? company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com' : domains[randomInt(0, domains.length - 1)];
  const username = name.toLowerCase().replace(/[^a-z0-9]/g, '') + randomInt(1, 999);
  return `${username}@${domain}`;
}

// 生成随机手机号
function randomPhone() {
  const prefixes = ['130', '131', '132', '133', '134', '135', '136', '137', '138', '139',
    '150', '151', '152', '153', '155', '156', '157', '158', '159',
    '180', '181', '182', '183', '184', '185', '186', '187', '188', '189'];
  const prefix = prefixes[randomInt(0, prefixes.length - 1)];
  const suffix = String(randomInt(10000000, 99999999));
  return prefix + suffix;
}

async function seedCRMData() {
  let connection;
  
  try {
    console.log('正在连接数据库...');
    connection = await mysql.createConnection({
      ...dbConfig,
      database: 'mysql' // 先连接到mysql数据库
    });

    // 创建CRM数据库（如果不存在）
    await connection.query('CREATE DATABASE IF NOT EXISTS crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await connection.query('USE crm');
    console.log('✓ CRM数据库已准备就绪');

    // 检查表是否已存在，如果不存在则创建
    const [tables] = await connection.query("SHOW TABLES LIKE 'customers'");
    if (tables.length === 0) {
      console.log('表不存在，正在创建表结构...');
      // 读取并执行创建表的SQL
      const createTablesSQL = fs.readFileSync(
        path.join(__dirname, 'create-crm-tables.sql'),
        'utf8'
      );
      
      // 执行创建表的SQL（跳过CREATE DATABASE和USE语句）
      const tableStatements = createTablesSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('CREATE DATABASE') && !s.startsWith('USE'));
      
      for (const statement of tableStatements) {
        if (statement) {
          await connection.query(statement);
        }
      }
      console.log('✓ CRM表结构已创建');
    } else {
      console.log('✓ 表已存在，跳过创建，直接生成数据');
    }

    // 生成数据
    console.log('\n开始生成测试数据...\n');

    // 1. 生成产品数据 (500个产品)
    console.log('正在生成产品数据...');
    const products = [];
    for (let i = 1; i <= 500; i++) {
      const name = productNames[randomInt(0, productNames.length - 1)] + ` ${i}`;
      const category = productCategories[randomInt(0, productCategories.length - 1)];
      const price = randomFloat(100, 50000);
      const cost = price * randomFloat(0.3, 0.7);
      
      products.push([
        name,
        `SKU-${String(i).padStart(6, '0')}`,
        `${name}的详细描述信息，适用于各种企业场景。`,
        category,
        price,
        cost,
        randomInt(0, 1000),
        '件',
        randomInt(0, 10) === 0 ? 'inactive' : 'active'
      ]);
    }
    
    await connection.query(
      `INSERT INTO products (name, sku, description, category, price, cost, stock_quantity, unit, status) VALUES ?`,
      [products]
    );
    console.log(`✓ 已生成 ${products.length} 个产品`);

    // 2. 生成客户数据 (5000个客户)
    console.log('正在生成客户数据...');
    const customers = [];
    const customerIds = [];
    for (let i = 1; i <= 5000; i++) {
      const name = randomChineseName();
      const company = randomInt(0, 3) === 0 ? null : randomCompanyName();
      const email = randomEmail(name, company);
      const industry = industries[randomInt(0, industries.length - 1)];
      const city = cities[randomInt(0, cities.length - 1)];
      const status = ['active', 'active', 'active', 'inactive', 'prospect'][randomInt(0, 4)];
      
      customers.push([
        name,
        email,
        randomPhone(),
        company,
        industry,
        '中国',
        city,
        `${city}市${randomInt(1, 10)}区${randomInt(1, 100)}号`,
        status,
        randomInt(0, 1) === 0 ? 'individual' : 'enterprise'
      ]);
    }
    
    const [customerResult] = await connection.query(
      `INSERT INTO customers (name, email, phone, company, industry, country, city, address, status, customer_type) VALUES ?`,
      [customers]
    );
    
    // 获取生成的客户ID
    for (let i = 0; i < customers.length; i++) {
      customerIds.push(customerResult.insertId + i);
    }
    console.log(`✓ 已生成 ${customers.length} 个客户`);

    // 3. 生成联系人数据 (10000个联系人)
    console.log('正在生成联系人数据...');
    const contacts = [];
    for (let i = 0; i < 10000; i++) {
      const customerId = customerIds[randomInt(0, customerIds.length - 1)];
      const firstName = firstNames[randomInt(0, firstNames.length - 1)];
      const lastName = lastNames[randomInt(0, lastNames.length - 1)];
      
      contacts.push([
        customerId,
        firstName,
        lastName,
        randomEmail(firstName + lastName, null),
        randomPhone(),
        ['经理', '主管', '总监', '专员', '助理', '工程师', '分析师'][randomInt(0, 6)],
        ['销售部', '市场部', '技术部', '财务部', '人事部', '运营部'][randomInt(0, 5)],
        randomInt(0, 5) === 0 ? 1 : 0
      ]);
    }
    
    await connection.query(
      `INSERT INTO contacts (customer_id, first_name, last_name, email, phone, position, department, is_primary) VALUES ?`,
      [contacts]
    );
    console.log(`✓ 已生成 ${contacts.length} 个联系人`);

    // 4. 生成线索数据 (8000个线索)
    console.log('正在生成线索数据...');
    const leads = [];
    const leadIds = [];
    const startDate = new Date('2023-01-01');
    const endDate = new Date();
    
    for (let i = 1; i <= 8000; i++) {
      const firstName = firstNames[randomInt(0, firstNames.length - 1)];
      const lastName = lastNames[randomInt(0, lastNames.length - 1)];
      const company = randomCompanyName();
      const source = leadSources[randomInt(0, leadSources.length - 1)];
      const statuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
      const weights = [30, 25, 20, 15, 10]; // 权重分布
      const status = statuses[getWeightedRandom(weights)];
      const score = randomInt(0, 100);
      const createdAt = randomDate(startDate, endDate);
      
      leads.push([
        firstName,
        lastName,
        randomEmail(firstName + lastName, company),
        randomPhone(),
        company,
        industries[randomInt(0, industries.length - 1)],
        source,
        status,
        score,
        `线索备注信息：对${company}的${source}来源线索进行跟进。`,
        `销售${randomInt(1, 20)}`,
        createdAt,
        createdAt,
        status === 'converted' ? randomDate(createdAt, endDate) : null
      ]);
    }
    
    const [leadResult] = await connection.query(
      `INSERT INTO leads (first_name, last_name, email, phone, company, industry, source, status, score, notes, assigned_to, created_at, updated_at, converted_at) VALUES ?`,
      [leads]
    );
    
    for (let i = 0; i < leads.length; i++) {
      leadIds.push(leadResult.insertId + i);
    }
    console.log(`✓ 已生成 ${leads.length} 个线索`);

    // 5. 生成商机数据 (6000个商机)
    console.log('正在生成商机数据...');
    const opportunities = [];
    const opportunityIds = [];
    
    for (let i = 1; i <= 6000; i++) {
      const customerId = randomInt(0, 5) === 0 ? null : customerIds[randomInt(0, customerIds.length - 1)];
      const leadId = randomInt(0, 3) === 0 ? null : leadIds[randomInt(0, leadIds.length - 1)];
      const name = `商机-${productNames[randomInt(0, productNames.length - 1)]}-${i}`;
      const amount = randomFloat(1000, 1000000);
      const stage = opportunityStages[randomInt(0, opportunityStages.length - 1)];
      const probability = stage === 'closed_won' ? 100 : stage === 'closed_lost' ? 0 : randomInt(10, 90);
      const expectedCloseDate = randomDate(new Date(), new Date(Date.now() + 180 * 24 * 60 * 60 * 1000));
      const actualCloseDate = (stage === 'closed_won' || stage === 'closed_lost') 
        ? randomDate(new Date('2023-01-01'), new Date()) 
        : null;
      
      opportunities.push([
        customerId,
        leadId,
        name,
        amount,
        stage,
        probability,
        expectedCloseDate,
        actualCloseDate,
        leadSources[randomInt(0, leadSources.length - 1)],
        `商机描述：${name}的详细信息和需求说明。`,
        `销售${randomInt(1, 20)}`,
        randomDate(new Date('2023-01-01'), new Date()),
        new Date()
      ]);
    }
    
    const [oppResult] = await connection.query(
      `INSERT INTO opportunities (customer_id, lead_id, name, amount, stage, probability, expected_close_date, actual_close_date, source, description, assigned_to, created_at, updated_at) VALUES ?`,
      [opportunities]
    );
    
    for (let i = 0; i < opportunities.length; i++) {
      opportunityIds.push(oppResult.insertId + i);
    }
    console.log(`✓ 已生成 ${opportunities.length} 个商机`);

    // 6. 生成订单数据 (10000个订单)
    console.log('正在生成订单数据...');
    const orders = [];
    const orderIds = [];
    const productIds = [];
    
    // 获取所有产品ID
    const [productRows] = await connection.query('SELECT id FROM products');
    productRows.forEach(row => productIds.push(row.id));
    
    for (let i = 1; i <= 10000; i++) {
      const customerId = customerIds[randomInt(0, customerIds.length - 1)];
      const opportunityId = randomInt(0, 3) === 0 ? null : opportunityIds[randomInt(0, opportunityIds.length - 1)];
      const orderNumber = `ORD-${new Date().getFullYear()}${String(i).padStart(8, '0')}`;
      const orderDate = randomDate(new Date('2023-01-01'), new Date());
      const status = orderStatuses[randomInt(0, orderStatuses.length - 1)];
      const totalAmount = randomFloat(100, 50000);
      const discountAmount = totalAmount * randomFloat(0, 0.2);
      const taxAmount = (totalAmount - discountAmount) * 0.1;
      const paymentStatus = ['unpaid', 'partial', 'paid'][randomInt(0, 2)];
      const paymentMethod = ['现金', '银行转账', '信用卡', '支付宝', '微信支付'][randomInt(0, 4)];
      
      orders.push([
        orderNumber,
        customerId,
        opportunityId,
        orderDate,
        status,
        totalAmount,
        discountAmount,
        taxAmount,
        `收货地址：${cities[randomInt(0, cities.length - 1)]}市`,
        `账单地址：${cities[randomInt(0, cities.length - 1)]}市`,
        paymentStatus,
        paymentMethod,
        `订单备注信息${i}`
      ]);
    }
    
    const [orderResult] = await connection.query(
      `INSERT INTO orders (order_number, customer_id, opportunity_id, order_date, status, total_amount, discount_amount, tax_amount, shipping_address, billing_address, payment_status, payment_method, notes) VALUES ?`,
      [orders]
    );
    
    for (let i = 0; i < orders.length; i++) {
      orderIds.push(orderResult.insertId + i);
    }
    console.log(`✓ 已生成 ${orders.length} 个订单`);

    // 7. 生成订单项数据 (30000个订单项)
    console.log('正在生成订单项数据...');
    const orderItems = [];
    
    for (let i = 0; i < 30000; i++) {
      const orderId = orderIds[randomInt(0, orderIds.length - 1)];
      const productId = productIds[randomInt(0, productIds.length - 1)];
      const quantity = randomInt(1, 50);
      
      // 获取产品价格
      const [productRows] = await connection.query('SELECT price FROM products WHERE id = ?', [productId]);
      const unitPrice = productRows[0]?.price || randomFloat(10, 1000);
      const discount = unitPrice * randomFloat(0, 0.15);
      const subtotal = (unitPrice - discount) * quantity;
      
      orderItems.push([
        orderId,
        productId,
        quantity,
        unitPrice,
        discount,
        subtotal
      ]);
    }
    
    await connection.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount, subtotal) VALUES ?`,
      [orderItems]
    );
    console.log(`✓ 已生成 ${orderItems.length} 个订单项`);

    // 8. 生成销售记录数据 (8000条)
    console.log('正在生成销售记录数据...');
    const sales = [];
    const regions = ['华东', '华南', '华北', '西南', '西北', '东北', '华中'];
    
    for (let i = 0; i < 8000; i++) {
      const orderId = randomInt(0, 3) === 0 ? null : orderIds[randomInt(0, orderIds.length - 1)];
      const opportunityId = randomInt(0, 3) === 0 ? null : opportunityIds[randomInt(0, opportunityIds.length - 1)];
      
      // 获取订单金额或商机金额
      let amount = randomFloat(1000, 100000);
      if (orderId) {
        const [orderRows] = await connection.query('SELECT total_amount FROM orders WHERE id = ?', [orderId]);
        amount = orderRows[0]?.total_amount || amount;
      } else if (opportunityId) {
        const [oppRows] = await connection.query('SELECT amount FROM opportunities WHERE id = ?', [opportunityId]);
        amount = oppRows[0]?.amount || amount;
      }
      
      const commission = amount * randomFloat(0.05, 0.15);
      const saleDate = randomDate(new Date('2023-01-01'), new Date());
      
      sales.push([
        orderId,
        opportunityId,
        `销售${randomInt(1, 20)}`,
        saleDate,
        amount,
        commission,
        regions[randomInt(0, regions.length - 1)]
      ]);
    }
    
    await connection.query(
      `INSERT INTO sales (order_id, opportunity_id, salesperson, sale_date, amount, commission, region) VALUES ?`,
      [sales]
    );
    console.log(`✓ 已生成 ${sales.length} 条销售记录`);

    // 9. 生成活动记录数据 (15000条)
    console.log('正在生成活动记录数据...');
    const activities = [];
    
    for (let i = 0; i < 15000; i++) {
      const customerId = randomInt(0, 3) === 0 ? null : customerIds[randomInt(0, customerIds.length - 1)];
      const opportunityId = randomInt(0, 5) === 0 ? null : opportunityIds[randomInt(0, opportunityIds.length - 1)];
      const leadId = randomInt(0, 5) === 0 ? null : leadIds[randomInt(0, leadIds.length - 1)];
      const type = activityTypes[randomInt(0, activityTypes.length - 1)];
      const subject = `${type === 'call' ? '电话' : type === 'email' ? '邮件' : type === 'meeting' ? '会议' : type === 'task' ? '任务' : '备注'}-${i + 1}`;
      const activityDate = randomDate(new Date('2023-01-01'), new Date());
      const status = ['planned', 'completed', 'cancelled'][randomInt(0, 2)];
      const duration = type === 'call' || type === 'meeting' ? randomInt(15, 120) : null;
      
      activities.push([
        customerId,
        opportunityId,
        leadId,
        type,
        subject,
        `${subject}的详细描述信息`,
        activityDate,
        duration,
        status,
        `销售${randomInt(1, 20)}`
      ]);
    }
    
    await connection.query(
      `INSERT INTO activities (customer_id, opportunity_id, lead_id, type, subject, description, activity_date, duration_minutes, status, assigned_to) VALUES ?`,
      [activities]
    );
    console.log(`✓ 已生成 ${activities.length} 条活动记录`);

    // 10. 生成账户数据 (2000个账户)
    console.log('正在生成账户数据...');
    const accounts = [];
    
    for (let i = 1; i <= 2000; i++) {
      const name = randomCompanyName();
      const industry = industries[randomInt(0, industries.length - 1)];
      const city = cities[randomInt(0, cities.length - 1)];
      const annualRevenue = randomFloat(100000, 100000000);
      const employeeCount = randomInt(10, 10000);
      
      accounts.push([
        name,
        industry,
        `www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        randomPhone(),
        randomEmail('contact', name),
        `${city}市${randomInt(1, 10)}区${randomInt(1, 100)}号`,
        city,
        '省',
        '中国',
        `${randomInt(100000, 999999)}`,
        annualRevenue,
        employeeCount,
        ['customer', 'partner', 'competitor'][randomInt(0, 2)],
        randomInt(0, 10) === 0 ? 'inactive' : 'active'
      ]);
    }
    
    await connection.query(
      `INSERT INTO accounts (name, industry, website, phone, email, address, city, state, country, postal_code, annual_revenue, employee_count, account_type, status) VALUES ?`,
      [accounts]
    );
    console.log(`✓ 已生成 ${accounts.length} 个账户`);

    console.log('\n✅ CRM测试数据生成完成！');
    console.log('\n数据统计：');
    console.log(`  - 产品: 500`);
    console.log(`  - 客户: 5,000`);
    console.log(`  - 联系人: 10,000`);
    console.log(`  - 线索: 8,000`);
    console.log(`  - 商机: 6,000`);
    console.log(`  - 订单: 10,000`);
    console.log(`  - 订单项: 30,000`);
    console.log(`  - 销售记录: 8,000`);
    console.log(`  - 活动记录: 15,000`);
    console.log(`  - 账户: 2,000`);
    console.log(`\n总计: 94,500+ 条记录`);

  } catch (error) {
    console.error('❌ 生成数据时出错:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 加权随机选择
function getWeightedRandom(weights) {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return i;
    }
  }
  return weights.length - 1;
}

// 运行脚本
if (require.main === module) {
  seedCRMData()
    .then(() => {
      console.log('\n脚本执行完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { seedCRMData };
