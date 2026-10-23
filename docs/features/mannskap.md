# Mannskap: Personell, Leverandører og Kompetanser

What the page does, as built. Moved from CLAUDE.md on 2026-10-23 so that it is read when work touches this part, not in every session; the rules of the code stay in CLAUDE.md.

**Personell** – the permanent staff with their competences. No two people have the same name: a file tells them apart by it.

**Leverandører** (`ui/leverandorer/`) – the suppliers people are hired from, made from Personell: a name each, the competences it can be ordered for, the shifts it sends people on (Dag, Kveld, Natt), kroner per hour and a contact. They belong to Innleid (`design_docs/innleid/`, built in the six slices of the Claude Doc «Innleid: build plan», 2026-10-13); the orders are made in the Kalender under Bemanning · Innleid.

**Kompetanser** – the name of each competence, how it is shown (short name, colour, order), and what names it. A competence has one name: changed here, it is changed on the product types, the demand, the planning rows, the people and their blocks (`renameCompetence` in `domain/competences.ts`).
