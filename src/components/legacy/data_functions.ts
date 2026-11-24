export default function IsWordInteractive(word: string): boolean {
    const excludedWords = [
        'were','been','have','does','doing','where','what','than','that','which','takes','other','become','becomes','becoming','until','travel','while','day','days','week',
        'weeks','month','months','year','years','hour','hours','minute','minutes','second','seconds', 'then', 'thus', 'being', 'away', 'from', 'further', 'more', 'less',
        'most', 'least', 'some', 'none', 'itself', 'with', 'each', 'every', 'either', 'neither', 'both'
    ];

    if(word.length > 3 && !excludedWords.includes(word.toLowerCase())) {
        return true;
    }

    return false;
}
