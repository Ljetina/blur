import 'dotenv/config';
import { getConversation } from './lib/db';
import { streamImageInterpretation } from './lib/openai';

const data = {
  'image/png':
    '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5AHA4x1YPN6BxeMdWDzegeXL4y2EwIULFxAbG2tT/84R3fXcBAUF4YYbbvDJc4WHh/PLEUA83oHF4x1YPN6BxeMdWL463rX12FgwoZiIiIikwuCGiIiIpMLgpg6MRiNycnJgNBqVboou8HgHFo93YPF4BxaPd2Apdbx1l1BMREREcmPPDREREUmFwQ0RERFJhcENERERSYXBDREREUmFwY0TixcvRnx8PEJDQ5GSkoKdO3e63H/16tXo2LEjQkNDcfPNN2PdunUBaqkcPDney5YtQ58+fdCkSRM0adIE6enptf7/kC1PP98Wq1atgsFgwNChQ/3bQMl4erzPnz+PsWPHomXLljAajbjpppt4TvGAp8d7wYIF6NChAxo0aIC4uDg8++yzuHz5coBaq21btmzB4MGDERsbC4PBgE8++aTWx2zevBm33norjEYj2rVrh3feecf3DRNkZ9WqVSIkJEQsX75c/PDDD+Lxxx8XkZGRoqSkxOH+27dvF8HBwWLOnDli37594oUXXhD169cXe/bsCXDLtcnT4z1ixAixePFisXv3brF//37xyCOPiIiICPHf//43wC3XJk+Pt8WxY8dEq1atRJ8+fcS9994bmMZKwNPjXVlZKbp37y4GDhwotm3bJo4dOyY2b94siouLA9xybfL0eL///vvCaDSK999/Xxw7dkx8+eWXomXLluLZZ58NcMu1ad26dWLKlCnio48+EgDExx9/7HL/o0ePioYNG4rs7Gyxb98+sXDhQhEcHCzy8/N92i4GNw707NlTjB071vp7dXW1iI2NFbNmzXK4/wMPPCAGDRpksy0lJUU88cQTfm2nLDw93jVdvXpVNG7cWLz77rv+aqJU6nK8r169Knr16iXeeustMXr0aAY3HvD0eC9ZskS0bdtWVFVVBaqJUvH0eI8dO1b069fPZlt2dra4/fbb/dpOGbkT3Dz33HOic+fONtuGDRsmMjIyfNoWDkvVUFVVhV27diE9Pd26LSgoCOnp6SgsLHT4mMLCQpv9ASAjI8Pp/vS7uhzvmi5evIgrV66gadOm/mqmNOp6vKdPn46oqCg8+uijgWimNOpyvD/77DOkpqZi7NixiI6ORpcuXTBz5kxUV1cHqtmaVZfj3atXL+zatcs6dHX06FGsW7cOAwcODEib9SZQ10vdLZxZm9LSUlRXVyM6Otpme3R0NA4cOODwMSaTyeH+JpPJb+2URV2Od00TJ05EbGys3ReG7NXleG/btg1vv/02iouLA9BCudTleB89ehQbN27EQw89hHXr1uHw4cN46qmncOXKFeTk5ASi2ZpVl+M9YsQIlJaWonfv3hBC4OrVq3jyySfx/PPPB6LJuuPselleXo5Lly6hQYMGPnkd9tyQpr3yyitYtWoVPv74Y4SGhirdHOlcuHABI0eOxLJly9C8eXOlm6MLZrMZUVFRePPNN5GcnIxhw4ZhypQpWLp0qdJNk9LmzZsxc+ZMvPHGGygqKsJHH32EtWvXYsaMGUo3jbzAnpsamjdvjuDgYJSUlNhsLykpQUxMjMPHxMTEeLQ//a4ux9vi1VdfxSuvvIINGzaga9eu/mymNDw93keOHMHx48cxePBg6zaz2QwAqFevHg4ePIiEhAT/NlrD6vL5btmyJerXr4/g4GDrtk6dOsFkMqGqqgohISF+bbOW1eV4v/jiixg5ciQee+wxAMDNN9+MiooKjBkzBlOmTEFQEPsAfMnZ9TI8PNxnvTYAe27shISEIDk5GQUFBdZtZrMZBQUFSE1NdfiY1NRUm/0BYP369U73p9/V5XgDwJw5czBjxgzk5+eje/fugWiqFDw93h07dsSePXtQXFxs/RkyZAjuvPNOFBcXIy4uLpDN15y6fL5vv/12HD582BpEAsCPP/6Ili1bMrCpRV2O98WLF+0CGEtgKbj0os8F7Hrp0/RkSaxatUoYjUbxzjvviH379okxY8aIyMhIYTKZhBBCjBw5UkyaNMm6//bt20W9evXEq6++Kvbv3y9ycnI4FdwDnh7vV155RYSEhIg1a9aI06dPW38uXLig1FvQFE+Pd02cLeUZT4/3iRMnROPGjcW4cePEwYMHxRdffCGioqLESy+9pNRb0BRPj3dOTo5o3Lix+Oc//ymOHj0qvvrqK5GQkCAeeOABpd6Cply4cEHs3r1b7N69WwAQ8+bNE7t37xY//fSTEEKISZMmiZEjR1r3t0wF/+tf/yr2798vFi9ezKnggbRw4UJx4403ipCQENGzZ0/x9ddfW/+WlpYmRo8ebbP/hx9+KG666SYREhIiOnfuLNauXRvgFmubJ8e7devWAoDdT05OTuAbrlGefr6vx+DGc54e7x07doiUlBRhNBpF27ZtxcsvvyyuXr0a4FZrlyfH+8qVK2LatGkiISFBhIaGiri4OPHUU0+JX3/9NfAN16BNmzY5PB9bjvHo0aNFWlqa3WOSkpJESEiIaNu2rVixYoXP22UQgv1uREREJA/m3BAREZFUGNwQERGRVBjcEBERkVQY3BAREZFUGNwQERGRVBjcEBERkVQY3BAREZFUGNwQERGRVBjcEBERkVQY3BAREZFUGNwQkeadPXsWMTExmDlzpnXbjh07EBISYrcCMRHJj2tLEZEU1q1bh6FDh2LHjh3o0KEDkpKScO+992LevHlKN42IAozBDRFJY+zYsdiwYQO6d++OPXv24Ntvv4XRaFS6WUQUYAxuiEgaly5dQpcuXXDy5Ens2rULN998s9JNIiIFMOeGiKRx5MgR/PzzzzCbzTh+/LjSzSEihbDnhoikUFVVhZ49eyIpKQkdOnTAggULsGfPHkRFRSndNCIKMAY3RCSFv/71r1izZg2+++47hIWFIS0tDREREfjiiy+UbhoRBRiHpYhI8zZv3owFCxbgvffeQ3h4OIKCgvDee+9h69atWLJkidLNI6IAY88NERERSYU9N0RERCQVBjdEREQkFQY3REREJBUGN0RERCQVBjdEREQkFQY3REREJBUGN0RERCQVBjdEREQkFQY3REREJBUGN0RERCQVBjdEREQkFQY3REREJJX/BzTZ23xpB5zFAAAAAElFTkSuQmCC',
  'text/plain': ['<Figure size 640x480 with 1 Axes>'],
};

async function doIt() {
  const conversation = await getConversation(
    '0bb1e088-ebf6-4007-aa8a-d0187d37e000'
  );
  //   console.log({conversation})
  const result = await streamImageInterpretation({
    conversation,
    flags: {
      hasAborted: false,
      shouldAbort: false,
    },
    image: data['image/png'],
    onEvent: (type, payload) => {
      console.log({ type, payload });
    },
    cache: {},
  });

  console.log({ result });
}

doIt().catch((e) => console.error(e));
