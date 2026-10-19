export const styles = ['graphite', 'iris', 'lagoon', 'ember', 'midnight', 'forest', 'wine', 'slate'];
export const styleColors = {graphite:'#121216',iris:'#19131e',lagoon:'#0d1919',ember:'#1b1512',midnight:'#111724',forest:'#141c16',wine:'#211319',slate:'#181d22'};
export const normalizeStyle = value => styles.includes(value) ? value : 'graphite';
