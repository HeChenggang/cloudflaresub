const key = 'config:clash-rules';
const root = 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/';
const defaults = {
  providers: [
    'ChinaDomain domain mrs ' + root + 'geosite/cn.mrs',
    'ChinaIP ipcidr mrs ' + root + 'geoip/cn.mrs'
  ],
  rules: ['GEOSITE,private,DIRECT', 'GEOIP,LAN,DIRECT,no-resolve', 'RULE-SET,ChinaDomain,DIRECT',
    'RULE-SET,ChinaIP,DIRECT,no-resolve', 'MATCH,节点选择']
};

export async function readRules(store) {
  return await store.get(key, 'json') || defaults;
}

export function renderRules({providers, rules}) {
  const lines = providers.length ? ['rule-providers:'] : [];
  const names = new Set();
  for (const provider of providers) {
    const [name, behavior, format, address, extra] = provider.trim().split(/\s+/);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) || names.has(name.toLowerCase()) ||
        !['domain','ipcidr','classical'].includes(behavior) || !['mrs','yaml','text'].includes(format) ||
        (behavior === 'classical' && format === 'mrs') || extra || new URL(address).protocol !== 'https:') {
      throw Error('请检查规则集名称、类型、格式和 HTTPS 地址，名称须唯一。');
    }
    names.add(name.toLowerCase());
    lines.push('  ' + JSON.stringify(name) + ':', '    type: http', '    behavior: ' + behavior,
      '    format: ' + format, '    url: ' + JSON.stringify(address),
      '    path: ./ruleset/' + name + '.' + format, '    interval: 86400');
  }
  lines.push('rules:');
  for (const [index, rule] of rules.entries()) {
    const fields = rule.split(',');
    const [type, value, policy, option] = fields;
    const last = index === rules.length - 1;
    const types = ['RULE-SET','DOMAIN','DOMAIN-SUFFIX','DOMAIN-KEYWORD','GEOSITE','GEOIP','IP-CIDR','IP-CIDR6'];
    const policies = ['DIRECT','REJECT','节点选择','自动选择'];
    const valid = last ? type === 'MATCH' && fields.length === 2 && policies.includes(value) :
      types.includes(type) && value && !/\s/.test(value) && policies.includes(policy) &&
      (fields.length === 3 || (fields.length === 4 && option === 'no-resolve' && ['RULE-SET','GEOIP','IP-CIDR','IP-CIDR6'].includes(type))) &&
      (type !== 'RULE-SET' || providers.some(p => p.split(/\s+/)[0] === value));
    if (!valid) throw Error('第 ' + (index + 1) + ' 条规则无效，请检查类型、策略和引用名称，并以 MATCH 结尾。');
    lines.push('  - ' + JSON.stringify(rule));
  }
  return lines.join('\n');
}

export async function rulesApi(request, store) {
  let config;
  if (request.method === 'GET') config = await readRules(store);
  else if (request.method === 'DELETE') {
    await store.delete(key);
    config = defaults;
  } else if (['POST','PUT'].includes(request.method)) {
    try {
      const raw = await request.text();
      if (raw.length > 65536) throw Error('配置超过 64 KiB。');
      const {providers, rules} = JSON.parse(raw);
      if (![providers,rules].every(Array.isArray) || !rules.length ||
          ![...providers,...rules].every(s => typeof s === 'string' && s.trim() === s && !/[\r\n]/.test(s))) throw Error('每行请输入一条规则或规则集。');
      config = {providers, rules};
      renderRules(config);
    } catch (e) { return new Response(e.message, {status:400}); }
    if (request.method === 'PUT') await store.put(key, JSON.stringify(config));
  } else return new Response('Method not allowed', {status:405});
  return Response.json({...config, preview:renderRules(config)}, {headers:{'cache-control':'no-store'}});
}
