import React, { createContext, useContext, useState, useEffect } from 'react';

const CurrencyContext = createContext();

export const CurrencyProvider = ({ children }) => {
    const [usdRate, setUsdRate] = useState(() => {
        const saved = localStorage.getItem('usd_conversion_rate');
        return saved ? parseFloat(saved) : 83.00;
    });

    useEffect(() => {
        localStorage.setItem('usd_conversion_rate', usdRate.toString());
    }, [usdRate]);

    return (
        <CurrencyContext.Provider value={{ usdRate, setUsdRate }}>
            {children}
        </CurrencyContext.Provider>
    );
};

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    if (!context) {
        throw new Error('useCurrency must be used within a CurrencyProvider');
    }
    return context;
};
