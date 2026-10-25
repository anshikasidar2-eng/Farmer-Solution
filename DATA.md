# Datasets

Only the three datasets that work are used. They are the **original files you supplied**, unchanged, in `server/datasets/`. The server reads them when it starts, so replacing a file and restarting changes the results.

| File | Used for | Notes |
|---|---|---|
| `Crop_recommendation.csv` | AI crop model; pH range, water need and growing conditions of each crop | 2,200 rows, 22 crops. The model scores 99.5% on held-out rows of this same data; real farms will be less accurate. |
| `Fertilizer_20Prediction.csv` | Fertilizer product finder | Every row appears twice and Excel changed the label `10-26-26` into a date. The loader removes the duplicates (99 distinct rows) and restores the label; the file itself is untouched. The product follows N, P, K only. |
| `crop_production.csv` | Yield estimate (district > state > all-India), season of each crop, state and district names | India, 1997-2015. Yield = production / area using 2005-2015 records. Jute bales are converted at 0.18 t per bale (assumption). |

`server/data/crop-info.json` holds the facts that are **not** in any dataset: crop names, soil types, duration and fertilizer doses (general agronomy knowledge; replace with ICAR / state department figures when you have them) and which production-file crop names belong to each crop.

Not used: PlantVillage, PlantDoc, the `week6_model.pt` model and the NASA POWER parameter list (it is a list of variable names, not data). Weather comes live from the NASA POWER service instead.

Crops without enough yield records show no yield estimate: kidney beans, pomegranate, grapes, watermelon, muskmelon, apple, coffee, coconut. Cotton uses an approximate range.
