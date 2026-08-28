import { describe, it, expect } from 'vitest';
import { parseHysteria2 } from '@/parser/hysteria2.parser';

describe('Hysteria2 parser', () => {
  it('should parse basic hysteria2 link', () => {
    const result = parseHysteria2(
      'hysteria2://pass123@example.com:443?sni=example.com&alpn=h3#MyHy2'
    );
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('hysteria2');
    expect(result.node?.server).toBe('example.com');
    expect(result.node?.port).toBe(443);
    expect(result.node?.password).toBe('pass123');
    expect(result.node?.sni).toBe('example.com');
    expect(result.node?.name).toBe('MyHy2');
  });

  it('should parse hy2:// short prefix', () => {
    const result = parseHysteria2('hy2://secret@1.2.3.4:8443#Test');
    expect(result.success).toBe(true);
    expect(result.node?.protocol).toBe('hysteria2');
    expect(result.node?.server).toBe('1.2.3.4');
    expect(result.node?.port).toBe(8443);
    expect(result.node?.password).toBe('secret');
  });

  it('should parse obfs salamander', () => {
    const result = parseHysteria2(
      'hysteria2://pass@example.com:443?obfs=salamander&obfs-password=obfssecret#Obfs'
    );
    expect(result.success).toBe(true);
    expect(result.node?.obfs).toBe('salamander');
    expect(result.node?.obfsPassword).toBe('obfssecret');
  });

  it('should parse ports for port hopping', () => {
    const result = parseHysteria2(
      'hysteria2://pass@example.com:443?mport=443-8443#Hopping'
    );
    expect(result.success).toBe(true);
    expect(result.node?.ports).toBe('443-8443');
  });

  it('should parse up/down bandwidth', () => {
    const result = parseHysteria2(
      'hysteria2://pass@example.com:443?up=30&down=200#BW'
    );
    expect(result.success).toBe(true);
    expect(result.node?.up).toBe('30');
    expect(result.node?.down).toBe('200');
  });

  it('should parse insecure flag', () => {
    const result = parseHysteria2(
      'hysteria2://pass@example.com:443?insecure=1#Insecure'
    );
    expect(result.success).toBe(true);
    expect(result.node?.allowInsecure).toBe(true);
  });

  it('should fail on missing @', () => {
    const result = parseHysteria2('hysteria2://pass:example.com:443');
    expect(result.success).toBe(false);
  });

  it('should fail on missing password', () => {
    const result = parseHysteria2('hysteria2://@example.com:443');
    expect(result.success).toBe(false);
  });
});
