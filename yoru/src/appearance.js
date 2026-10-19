export const styles = ['graphite', 'iris', 'lagoon', 'ember', 'midnight'];
export const styleColors = {graphite:'#121216',iris:'#19131e',lagoon:'#0d1919',ember:'#1b1512',midnight:'#111724'};
export const normalizeStyle = value => styles.includes(value) ? value : 'graphite';
