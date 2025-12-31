I want to turn this spreadsheet (samples/Budget March 2022.xlsx) into a web app for my own use, but I need to explain it very well to a coding agent. Help me take this rambling description and turn it into a very tight epic and user stories to make this. It should match in detail how this spreadsheet works (but don't worry about the Savings sheet). Think very hard. It needs to be perfect.

1. 1.Each month has its own budget that is treated as its own period.
2. 2.At the beginning of the month, the budget is set for that month based on the sum of the anticipated income for the month. Then certain things are set like if I want to donate 10% to charity, or $500 to my RRSP, or $300 to other saving, that is removed from the budget total before we even get to setting our expense budget goals by category. For example, Let’s say my anticipated income for the month is $5732.15, then we subtract $573.22 for charitable giving, then $500 for retirement savings, then $359.82 for other savings, so we end up with $4299.12 to spend on everything else for the month. There should be a set up area of that app where we can set these things.
3. 3.Then for the month we choose how much is budgeted for each spending category. The spending categories are 
Recurring - Essential
Recurring - Non-Essential
Auto
Grocery
Dining
Entertainment
Other - Fun
Other - Responsible
4. 4.The most important feature of this app that differentiates it from other apps is that it should treat recurring expenses as already spent. So we don’t really have $4299.12, because some of that is already spoken for with my mortgage, bills, and other recurring expenses. Because we already know what those are up front, or have a pretty good guess, we treat that as already spent. Those recurring transactions should be already added to the transactions list, even before they actually show up on any of the uploaded CSVs. They should be “Recurring - Essential” and “Recurring - Non-Essential” categories. Things like mortgage and utilities are recurring essential. Things like streaming services and Patreon are non-essential. 
5. 5. There should be a place to configure recurring transactions. And you can upload a csv of like several months of transactions and it can figure out what’s recurring. And you can edit it after. 
6. 6.There should be an area where we compare how much we are over or under budget overall and for each category.
7. 7.You should be able to manually add and delete transactions too.
8. 8. Small bug, right now it’s interpreting the credit card statement backward. When you see a postitve amount on a credit card it mean it is a debit - it’s costing me money. Right now the app is interpreting those amounts as income.
9. 9. There should be an option to ignore certain types of transactions. For example this time, this time “bns scotiaonline/teles” was imported, but that’s actually a credit card payment. If I see something like that in the app, I should be able to say “ignore transactions like these”, but then in the settings see the ones that are being ignored. 
10. 10. Let’s reset the database and let me try from scratch.
11. 11. When you upload the csv and it sees a transaction that is likely one of the recurring transactions, it should mark that as charged.




1. The anticipated income got messed up when I put a thousands separator in. All of the amount entries should be able to handle that. It should also be rounding to cents (bankers rounding). It should also strip $ signs
2. Can we have to suggest category budget amounts based on previous months when setting up? Like, upload a csv and figure out the proportion?
3. Recurring setup needs to be prior to category budget setup.You need other know the recurring amounts before you can determine the other amounts.
4. The category budget setup is not dynamic enough, I need to be able to see what it adds up to and whether it is balanced. The total should be equal to what’s Available for Expenses minus what’s already committed to recurring. 
5. The CSV import didn’t work. It said “Success! Imported 0 transactions” which doesn’t make sense. I’ve attached the CSVs I used.
1. CSV upload is still not working. I’m still getting “Success! Imported 0 transactions”


1. The recurring detection could be better. I should be able to see under each suggestion what months it has seen it in, on what date. 
2. What happens when you upload a transaction that has already been uploaded? It should say “XX duplicates skipped”
3. Can we reset the database?
4. I shouldn’t have to choose checking or credit when uploading. It should just know based on the format. 
5. Can I drag two files in at once? Even if one is checking and one is credit?


1. It’s weird that it detected 31 duplicates when I imported this files. I had just reset the database, and this file was straight from the bank, so there shouldn’t bet have been any duplicates.
2. The recurring expense detector still leaves a lot to be desired. It seems to just be looking for anything description that appears more than once, which isn’t helpful. It should look specifically for things that recur once a month. So for example, if I have an iCloud subscription for $20 a month, and an Apple Music Subscription for $15 a month, they both will show up under Apple as the description, but it should figure out I have two separate recurring transactions. But if I make a one-off purchase on iTunes for $5, that shouldn’t be counted as recurring. And if I have my Emmax bill, that description only shows up once a month at close to the same day, but it’s a different amount because it’s a utility that depends on usage. There should be more info about why it was detected as recurring. Like what days of the month it usually comes on and the price range. And then you should be able to click on the previous examples to see specific details. 
3. After you add a recurring expense it should appear in a list of recurring expenses that can be edited. It should include all the details
4. When you hit an ignore rule, it doesn’t remove the transaction. Fix that.
5. It allows you to add multiple identical ignore rules. Fix that.


1. After you add a suggested recurring transaction, the suggestion should go away
2. It shouldn’t suggest recurring transactions that appear to be canceled. For example, it it sees the same charge every month, but it stops 3 months ago, then it’s probably not happening anymore, so don’t suggest it. 
3. A lot of things are coming up with higher than 100% confidence. I found that odd.
4. The recurring one didn’t detect my mortgage payment. 
5. I don’t like having to hit “generate recurring transactions for this month”. It should just be on there without me doing anything. But if it matches up with an imported transaction, it should be marked as having happened (rather than just having been forcasted to happen).


1. Recurring donation suggestions should include sub-description
2. Mortgage still isn’t showing up in recurring expense detection.
3. Add the ability to edit the recurring expense
4. For some reason the date range on the transaction page starts one day earlier than the month we’re in. For example, for July, it is showing transactions from 2025-06-30. Fix that please
5. It’s still not removing the suggestion after you add the recurring expense. Fix that please. 


1. For the recurring suggestions, there should be a “do not add” button and a don’t show again checkbox.  
2. It’s still not finding the mortgage in the recurring auto-detection. 
3. Try to make the whole recurring auto-detection smarter. There’s gas stations and grocery stores coming up in there that shouldn't
4. There should be a button to hide suggestions. 
5. For some reason the date range on the transaction page still starts one day earlier than the month we’re in. For example, for July, it is showing transactions from 2025-06-30. Fix that please
6. The suggest based on history for the budgets is way off.
