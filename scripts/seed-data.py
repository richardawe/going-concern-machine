"""Rebuild the small, source-checked annual snapshot shipped with the app (USD millions).
These are dated FY2025/FY2024 snapshots, never presented as live or TTM data.
"""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public/data'
root.mkdir(parents=True,exist_ok=True)
apple='https://www.apple.com/newsroom/pdfs/fy2025-q4/FY25_Q4_Consolidated_Financial_Statements.pdf'
ms='https://www.microsoft.com/en-us/Investor/earnings/FY-2025-Q4/'
companies=[('AAPL','Apple Inc.',apple,[(2025,'2025-09-27',dict(revenue=416161,cogs=220960,grossProfit=195201,operatingProfit=133050,tax=20719,operatingCashFlow=111482,capex=12715,cash=35934,debt=98657,equity=73733,depreciation=11698,rd=34550,dividends=15421)),(2024,'2024-09-28',dict(revenue=391035,cogs=210352,grossProfit=180683,operatingProfit=123216,tax=29749,operatingCashFlow=118254,capex=9447,cash=29943,debt=106629,equity=56950,depreciation=11445,rd=31370,dividends=15234))]),('MSFT','Microsoft Corporation',ms,[(2025,'2025-06-30',dict(revenue=281724,cogs=87831,grossProfit=193893,operatingProfit=128528,tax=21795,operatingCashFlow=136162,capex=64551,cash=30242,debt=43151,equity=343479,rd=32488,dividends=24082)),(2024,'2024-06-30',dict(revenue=245122,cogs=74114,grossProfit=171008,operatingProfit=109433,tax=19651,operatingCashFlow=118548,capex=44477,cash=18315,debt=51630,equity=268477,rd=29510,dividends=21771))])]
for ticker,name,url,years in companies:
    statements=[]
    for year,end,values in years:
        facts={}
        for key,value in values.items():
            source=url
            if ticker=='MSFT': source+= 'balance-sheets' if key in ['cash','debt','equity'] else 'cash-flows' if key in ['operatingCashFlow','capex','dividends'] else 'income-statements'
            facts[key]=dict(value=value*1000000,status='CALCULATED' if key=='debt' else 'OBSERVED',source=name+' FY2025 annual earnings statements',url=source,period=end)
            if key=='debt': facts[key]['calculation']='Current term debt + noncurrent term debt + commercial paper; excludes lease liabilities'
        for key in ['interestExpense','depreciation']:
            if key not in facts:facts[key]=dict(value=None,status='UNAVAILABLE',source='Not separately extracted from this snapshot',period=end)
        statements.append(dict(period=end,fiscalYear=year,facts=facts))
    (root/(ticker+'.json')).write_text(json.dumps(dict(ticker=ticker,name=name,currency='USD',updated='2026-09-26',provider='Verified annual earnings snapshot',statements=statements),indent=2)+'\n')
(root/'index.json').write_text(json.dumps(dict(tickers=[c[0] for c in companies],updated='2026-09-26',mode='Dated annual snapshots; not live prices or TTM'),indent=2)+'\n')
