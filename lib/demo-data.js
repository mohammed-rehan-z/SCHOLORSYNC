export const demoPapers = [
  {
    id: "attention-is-all-you-need",
    title: "Attention Is All You Need",
    authors: "Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin",
    year: "2017",
    pageCount: 11,
    tags: ["Deep Learning", "Transformer", "NLP", "Self-Attention"],
    citation: {
      apa: "Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30, 5998-6008.",
      mla: "Vaswani, Ashish, et al. 'Attention is all you need.' Advances in Neural Information Processing Systems 30 (2017): 5998-6008.",
      bibtex: `@inproceedings{vaswani2017attention,
  title={Attention is all you need},
  author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N and Kaiser, Lukasz and Polosukhin, Illia},
  booktitle={Advances in Neural Information Processing Systems},
  pages={5998--6008},
  year={2017}
}`
    },
    tabularData: {
      authors: "Ashish Vaswani et al.",
      year: "2017",
      problem: "Dominant sequence transduction models rely on complex recurrent or convolutional neural networks in encoder-decoder structures, limiting parallelization during training and increasing computational cost over long ranges.",
      methodology: "Introduced the Transformer, a novel sequence transduction architecture relying entirely on self-attention mechanisms, replacing recurrent layers with Multi-Head Attention to process sequence tokens in parallel.",
      keyFindings: "Achieved state-of-the-art translation quality on WMT 2014 English-to-German (28.4 BLEU) and English-to-French (41.8 BLEU) tasks. Training completed in a fraction of the time compared to recurrent ensembles.",
      contributions: "Pioneered the self-attention architecture (Transformer), showing that recurrence is not necessary for high-quality sequence representation.",
      dataset: "WMT 2014 English-to-German (4.5M sentence pairs) and English-to-French (36M sentence pairs)"
    },
    summary: `# Executive Summary: Attention Is All You Need

## 1. Abstract & Introduction
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. The most performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. 

## 2. Core Methodology
The Transformer uses stacked self-attention and point-wise, fully connected layers for both the encoder and decoder.
- **Scaled Dot-Product Attention**: Computes attention weights on a query matrix $Q$, key matrix $K$, and value matrix $V$ using:
  $$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$
- **Multi-Head Attention**: Allows the model to jointly attend to information from different representation subspaces at different positions.
- **Positional Encoding**: Since the model contains no recurrence, positional encodings are added to the input embeddings to convey sequence order.

## 3. Key Findings & Results
The Transformer model achieves state-of-the-art results on translation tasks:
- **WMT 2014 English-to-German**: Establishes a new state-of-the-art BLEU score of 28.4, outperforming best ensembles by over 2.0 BLEU.
- **WMT 2014 English-to-French**: Reaches 41.8 BLEU score using a single model trained for 3.5 days, a fraction of the training cost of previous models.

## 4. Limitations
- Lacks local inductive biases inherent in convolutional networks, requiring larger amounts of data to generalize.
- Computational complexity of self-attention is quadratic $O(n^2)$ with respect to the sequence length $n$, which limits efficiency on extremely long contexts.

## 5. Future Directions
The authors plan to apply attention-based models to problems involving input and output modalities other than text, such as image, audio, and video generation. Investigating local or restricted attention areas is another key direction.`,
    chunks: [
      {
        id: "att-chunk-1",
        page: 1,
        paperId: "attention-is-all-you-need",
        content: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration. The most performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train."
      },
      {
        id: "att-chunk-2",
        page: 2,
        paperId: "attention-is-all-you-need",
        content: "Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence. We compute Scaled Dot-Product Attention on query matrix Q, key matrix K, and value matrix V with scaling factor 1/sqrt(d_k). Multi-head attention allows the model to jointly attend to information from different representation subspaces. We add positional encodings to the input embeddings at the bottoms of the encoder and decoder stacks."
      },
      {
        id: "att-chunk-3",
        page: 3,
        paperId: "attention-is-all-you-need",
        content: "We trained on the standard WMT 2014 English-to-German dataset consisting of about 4.5 million sentence pairs. For English-to-French, we used the significantly larger WMT 2014 English-to-French dataset consisting of 36 million sentence pairs. On the WMT 2014 English-to-German translation task, the big transformer model establishes a new state-of-the-art BLEU score of 28.4. On English-to-French, it achieves a BLEU score of 41.8, outperforming all of the previously published single models."
      }
    ],
    type: "preloaded"
  },
  {
    id: "adam-stochastic-optimization",
    title: "Adam: A Method for Stochastic Optimization",
    authors: "Diederik P. Kingma, Jimmy Ba",
    year: "2014",
    pageCount: 15,
    tags: ["Optimization", "Deep Learning", "Stochastic Calculus", "Adam"],
    citation: {
      apa: "Kingma, D. P., & Ba, J. (2014). Adam: A method for stochastic optimization. arXiv preprint arXiv:1412.6980.",
      mla: "Kingma, Diederik P., and Jimmy Ba. 'Adam: A method for stochastic optimization.' arXiv preprint arXiv:1412.6980 (2014).",
      bibtex: `@article{kingma2014adam,
  title={Adam: A method for stochastic optimization},
  author={Kingma, Diederik P and Ba, Jimmy},
  journal={arXiv preprint arXiv:1412.6980},
  year={2014}
}`
    },
    tabularData: {
      authors: "Diederik P. Kingma & Jimmy Ba",
      year: "2014",
      problem: "Traditional stochastic gradient descent (SGD) optimizers have fixed learning rates or rigid decays, leading to slow convergence in complex, noisy, or sparse gradient landscapes of deep neural networks.",
      methodology: "Proposed Adam, an algorithm for first-order gradient-based optimization of stochastic objective functions, which calculates adaptive learning rates for different parameters from estimates of the first (mean) and second (uncentered variance) moments of the gradients.",
      keyFindings: "Demonstrated faster empirical convergence and superior optimization stability on MNIST, CIFAR-10, and IMDB datasets compared to SGD, AdaGrad, and RMSProp.",
      contributions: "Introduced the Adam optimization algorithm, which became the industry standard for training deep neural networks.",
      dataset: "MNIST handwritten digits, CIFAR-10 object recognition, and IMDB movie review sentiment classification datasets"
    },
    summary: `# Executive Summary: Adam: A Method for Stochastic Optimization

## 1. Abstract & Introduction
We introduce Adam, an algorithm for first-order gradient-based optimization of stochastic objective functions, based on adaptive estimates of lower-order moments. The method is straightforward to implement, is computationally efficient, has little memory requirements, is invariant to diagonal rescaling of the gradients, and is well-suited for problems that are large in terms of data and/or parameters.

## 2. Core Methodology
Adam updates network parameters $\\theta$ dynamically using running averages of the gradients $g_t$:
- **First Moment Estimate**: Running mean of gradients with decay rate $\\beta_1$:
  $$m_t = \\beta_1 m_{t-1} + (1-\\beta_1) g_t$$
- **Second Moment Estimate**: Running uncentered variance of gradients with decay rate $\\beta_2$:
  $$v_t = \\beta_2 v_{t-1} + (1-\\beta_2) g_t^2$$
- **Bias Correction**: Corrects initialization bias towards zero:
  $$\\hat{m}_t = \\frac{m_t}{1 - \\beta_1^t}, \\quad \\hat{v}_t = \\frac{v_t}{1 - \\beta_2^t}$$
- **Parameter Update Rule**:
  $$\\theta_t = \\theta_{t-1} - \\frac{\\alpha}{\\sqrt{\\hat{v}_t} + \\epsilon} \\hat{m}_t$$

## 3. Key Findings & Results
Using large-scale models, Adam was compared to other optimization algorithms:
- **Convergence speed**: Outperformed AdaGrad, RMSProp, and AdaDelta across MNIST neural networks and Convolutional Networks on CIFAR-10.
- **Robustness**: Showed high resilience to hyperparameter choices; default hyperparameters ($\\alpha=0.001$, $\\beta_1=0.9$, $\\beta_2=0.999$, $\\epsilon=10^{-8}$) work well for almost all tasks.

## 4. Limitations
- Sometimes converges to suboptimal local minima compared to carefully tuned SGD with momentum on specific generalization tasks (e.g. image classification).
- Relies on estimation of historical moments, requiring double the memory for tracking states per parameter.

## 5. Future Directions
Future work includes studying multi-objective stochastic optimization problems using adaptive moments, and addressing theoretical convergence properties under non-convex setups.`,
    chunks: [
      {
        id: "adam-chunk-1",
        page: 1,
        paperId: "adam-stochastic-optimization",
        content: "We introduce Adam, an algorithm for first-order gradient-based optimization of stochastic objective functions, based on adaptive estimates of lower-order moments. The method is straightforward to implement, is computationally efficient, has little memory requirements, is invariant to diagonal rescaling of the gradients, and is well-suited for problems that are large in terms of data and/or parameters. The method is also appropriate for non-stationary objectives and problems with very noisy and/or sparse gradients."
      },
      {
        id: "adam-chunk-2",
        page: 2,
        paperId: "adam-stochastic-optimization",
        content: "In Adam, moving averages of the gradient m_t (first moment) and squared gradient v_t (second moment) are updated. The hyperparameters beta_1 and beta_2 control the exponential decay rates. Because these moving averages are initialized as zero vectors, they are biased towards zero, especially during initial steps. We correct this by calculating bias-corrected first and second moment estimates, m_hat and v_hat. The final parameter update uses alpha divided by (sqrt(v_hat) + epsilon) multiplied by m_hat."
      },
      {
        id: "adam-chunk-3",
        page: 3,
        paperId: "adam-stochastic-optimization",
        content: "We demonstrate the efficacy of Adam through several experiments. We train a multilayer feed-forward neural network on the MNIST images. We also train convolutional neural networks on the CIFAR-10 dataset. In our experiments, Adam converges faster and achieves lower training loss compared to other stochastic optimizers such as AdaGrad, RMSProp, and stochastic gradient descent with momentum."
      }
    ],
    type: "preloaded"
  }
];
