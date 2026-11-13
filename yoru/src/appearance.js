export const styles = ['graphite', 'iris', 'lagoon', 'ember', 'midnight', 'forest', 'wine', 'slate', 'sakura', 'sand'];
export const styleColors = {graphite:'#131517',iris:'#191224',lagoon:'#0b1d24',ember:'#25170f',midnight:'#0e1529',forest:'#101e17',wine:'#271019',slate:'#1c2226',sakura:'#281a27',sand:'#282113'};
export const normalizeStyle = value => styles.includes(value) ? value : 'graphite';
