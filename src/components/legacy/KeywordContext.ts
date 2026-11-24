import { createContext } from "react";

export interface KeywordContextValue {
    keyword: string;
    setKeyword: (keyword: string) => void;
}

export const KeywordContext = createContext<KeywordContextValue>({
    keyword: "",
    setKeyword: () => {}
});
